import secrets
from collections.abc import Callable, Coroutine
from typing import Annotated, Final, NoReturn, TypeAlias
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.routing import APIRoute

from litellm.models.commerce_auth import (
    AuthError,
    Binding,
    Credentials,
    EmailInput,
    FrozenModel,
    LoginResult,
    OAuthStart,
    PasswordInput,
    ProviderID,
    Registration,
    ResetInput,
    Session,
    TokenInput,
)
from litellm.proxy.auth.network import TrustedProxyConfig, resolve_client_ip
from litellm.proxy.commerce.auth_service import AccountService
from litellm.proxy.commerce.config import load_settings
from litellm.proxy.commerce.oauth_client import OAuthClient, ProviderClient
from litellm.repositories.commerce_auth_repository import AccountDatabase, AccountRepository


async def get_service() -> AccountService:
    from litellm.proxy.proxy_server import prisma_client
    from litellm.proxy.commerce.login_settings_service import LoginSettingsService
    from litellm.repositories.commerce_login_settings_repository import LoginConfigurationRepository

    settings: Final = load_settings()
    if settings is None or prisma_client is None:
        raise HTTPException(503, detail="account_service_unavailable")
    db: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # __getattr__ proxy
    effective: Final = await LoginSettingsService(LoginConfigurationRepository(db), settings).effective()
    if isinstance(effective, AuthError):
        raise_public(effective)
    return AccountService(AccountRepository(db, default_models=effective.default_models), effective)


Service: TypeAlias = Annotated[AccountService, Depends(get_service)]


def cookie_name(service: AccountService, kind: str) -> str:
    return ("__Host-coca_" if service.settings.secure_cookies else "coca_") + kind


def set_cookie(response: Response, service: AccountService, kind: str, value: str, age: int) -> None:
    response.set_cookie(
        cookie_name(service, kind),
        value,
        max_age=age,
        httponly=True,
        secure=service.settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def raise_public(error: AuthError) -> NoReturn:
    raise HTTPException(error.status, detail=error.code)


async def guard(request: Request, service: Service) -> None:
    origin: Final = request.headers.get("origin")
    if (origin and origin != service.settings.public_url) or request.headers.get("sec-fetch-site") == "cross-site":
        raise_public(AuthError("invalid_origin", 403))
    if request.method in {"GET", "HEAD"}:
        return
    if origin != service.settings.public_url:
        raise_public(AuthError("invalid_origin", 403))
    session_token: Final = request.cookies.get(cookie_name(service, "session"), "")
    session: Final = await service.session(session_token)
    csrf_source: Final = session_token if session else request.cookies.get(cookie_name(service, "browser"), "")
    if not service.security.matches_csrf(csrf_source, request.headers.get("x-csrf-token", "")):
        raise_public(AuthError("invalid_csrf", 403))
    ip, _ = resolve_client_ip(
        request,
        TrustedProxyConfig(
            use_forwarded_for=bool(service.settings.trusted_proxies),
            trusted_proxy_cidrs=service.settings.trusted_proxies,
        ),
    )
    if not await service.rate_limit("account-ip", ip or "unknown", 40):
        raise_public(AuthError("too_many_attempts", 429))


class AccountRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[object, object, Response]]:
        original: Final = super().get_route_handler()

        async def handle(request: Request) -> Response:
            try:
                response: Final = await original(request)
            except RequestValidationError:
                return JSONResponse(
                    {"detail": "invalid_request"},
                    status_code=422,
                    headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
                )
            except HTTPException as error:
                return JSONResponse(
                    {"detail": error.detail},
                    status_code=error.status_code,
                    headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
                )
            finally:
                if request.url.path.endswith("/callback"):
                    request.scope["query_string"] = b""  # rebind-ok: redact failed callbacks from Uvicorn logs
            response.headers["Cache-Control"] = "no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
            return response

        return handle


class AccountErrorView(FrozenModel):
    detail: str


error_codes: Final[tuple[int | str, ...]] = (400, 401, 403, 404, 409, 422, 429, 502, 503)
router: Final = APIRouter(
    prefix="/account/api/v1",
    tags=["Customer accounts"],
    route_class=AccountRoute,
    responses={code: {"model": AccountErrorView} for code in error_codes},
)
protected: Final = APIRouter(dependencies=[Depends(guard)], route_class=AccountRoute)


class ProviderView(FrozenModel):
    id: ProviderID
    label: str


class MethodsView(FrozenModel):
    registration_enabled: bool
    email_enabled: bool
    providers: tuple[ProviderView, ...]
    csrf_token: str


class ProfileView(FrozenModel):
    user_id: str
    email: str | None
    email_verified: bool
    has_password: bool
    csrf_token: str
    bindings: tuple[Binding, ...]
    reauthentication_required: bool


class MessageView(FrozenModel):
    message: str = "ok"


class AuthorizationView(FrozenModel):
    authorization_url: str


async def require_session(request: Request, service: Service) -> Session:
    session: Final = await service.session(request.cookies.get(cookie_name(service, "session")))
    if session is None:
        raise HTTPException(401, detail="authentication_required")
    return session


CurrentSession: TypeAlias = Annotated[Session, Depends(require_session)]


@protected.get("/auth-methods", response_model=MethodsView)
async def methods(request: Request, response: Response, service: Service) -> MethodsView:
    browser: Final = request.cookies.get(cookie_name(service, "browser")) or secrets.token_urlsafe(32)
    set_cookie(response, service, "browser", browser, 86400)
    raw_session: Final = request.cookies.get(cookie_name(service, "session"), "")
    session: Final = await service.session(raw_session)
    return MethodsView(
        registration_enabled=service.settings.registration_enabled,
        email_enabled=service.settings.email_ready,
        providers=tuple(ProviderView(id=p.id, label=p.label) for p in service.settings.providers),
        csrf_token=service.security.csrf(raw_session if session else browser),
    )


@protected.post("/register", response_model=MessageView, status_code=201)
async def register(body: Registration, service: Service) -> MessageView:
    result: Final = await service.register(str(body.email), body.password.get_secret_value())
    if isinstance(result, AuthError):
        raise_public(result)
    return MessageView(message="verification_email_queued")


@protected.post("/login", response_model=MessageView)
async def login(body: Credentials, request: Request, response: Response, service: Service) -> MessageView:
    result: Final = await service.login(str(body.email), body.password.get_secret_value())
    if isinstance(result, AuthError):
        raise_public(result)
    if not isinstance(result, LoginResult):
        raise HTTPException(500)
    old: Final = request.cookies.get(cookie_name(service, "session"))
    if old:
        await service.logout(old)
    set_cookie(response, service, "session", result.token, 604800)
    return MessageView()


@protected.get("/me", response_model=ProfileView)
async def profile(request: Request, service: Service, session: CurrentSession) -> ProfileView:
    customer: Final = session.customer
    return ProfileView(
        user_id=customer.user_id,
        email=customer.email,
        email_verified=customer.email_verified,
        has_password=customer.password_hash is not None,
        csrf_token=service.security.csrf(request.cookies.get(cookie_name(service, "session"), "")),
        bindings=await service.store.bindings(customer.user_id),
        reauthentication_required=not service.recently_authenticated(session),
    )


@protected.post("/logout", response_model=MessageView)
async def logout(request: Request, response: Response, service: Service, session: CurrentSession) -> MessageView:
    await service.store.revoke_session(session.token_hash)
    response.delete_cookie(
        cookie_name(service, "session"), path="/", secure=service.settings.secure_cookies, httponly=True, samesite="lax"
    )
    return MessageView()


@protected.post("/verification-email", response_model=MessageView)
async def verification_email(body: EmailInput, service: Service) -> MessageView:
    result: Final = await service.request_email(str(body.email), "verify")
    if result:
        raise_public(result)
    return MessageView(message="if_account_exists_email_queued")


@protected.post("/forgot-password", response_model=MessageView)
async def forgot_password(body: EmailInput, service: Service) -> MessageView:
    result: Final = await service.request_email(str(body.email), "reset")
    if result:
        raise_public(result)
    return MessageView(message="if_account_exists_email_queued")


@protected.post("/verify-email", response_model=MessageView)
async def verify_email(body: TokenInput, service: Service) -> MessageView:
    if not await service.verify_email(body.token):
        raise_public(AuthError("invalid_or_expired_token"))
    return MessageView()


@protected.post("/reset-password", response_model=MessageView)
async def reset_password(body: ResetInput, service: Service) -> MessageView:
    if not await service.reset_password(body.token, body.password.get_secret_value()):
        raise_public(AuthError("invalid_or_expired_token"))
    return MessageView()


@protected.post("/email", response_model=MessageView)
async def complete_email(body: EmailInput, service: Service, session: CurrentSession) -> MessageView:
    result: Final = await service.complete_email(session, str(body.email))
    if result:
        raise_public(result)
    return MessageView(message="verification_email_queued")


@protected.post("/password", response_model=MessageView)
async def change_password(
    body: PasswordInput, response: Response, service: Service, session: CurrentSession
) -> MessageView:
    result: Final = await service.change_password(
        session,
        body.password.get_secret_value(),
        body.current_password.get_secret_value() if body.current_password else None,
    )
    if result:
        raise_public(result)
    response.delete_cookie(
        cookie_name(service, "session"), path="/", secure=service.settings.secure_cookies, httponly=True, samesite="lax"
    )
    return MessageView(message="sign_in_again")


def get_oauth_client(service: Service) -> OAuthClient:
    return ProviderClient(service.settings, service.security)


OAuth: TypeAlias = Annotated[OAuthClient, Depends(get_oauth_client)]


async def start_authorization(
    provider: ProviderID,
    body: OAuthStart,
    request: Request,
    service: AccountService,
    client: OAuthClient,
    link: bool = False,
) -> AuthorizationView:
    session: Final = await service.session(request.cookies.get(cookie_name(service, "session")))
    result: Final = await service.start_flow(
        provider,
        request.cookies.get(cookie_name(service, "browser"), ""),
        "link" if link else body.intent,
        session,
        body.return_path,
    )
    if isinstance(result, AuthError):
        raise HTTPException(result.status, detail=result.code)
    state, flow = result
    config: Final = service.settings.provider(provider)
    if config is None:
        raise HTTPException(404, detail="provider_unavailable")
    url: Final = await client.authorize(config, state, flow)
    if isinstance(url, AuthError):
        raise HTTPException(url.status, detail=url.code)
    return AuthorizationView(authorization_url=url)


@protected.post("/oauth/{provider}/start", response_model=AuthorizationView)
async def oauth_start(
    provider: ProviderID, body: OAuthStart, request: Request, service: Service, client: OAuth
) -> AuthorizationView:
    return await start_authorization(provider, body, request, service, client)


@protected.post("/oauth/{provider}/link", response_model=AuthorizationView)
async def oauth_link(
    provider: ProviderID, body: OAuthStart, request: Request, service: Service, client: OAuth, session: CurrentSession
) -> AuthorizationView:
    return await start_authorization(provider, body, request, service, client, link=True)


@protected.post("/bindings/{binding_id}/remove", response_model=MessageView)
async def remove_binding(binding_id: str, service: Service, session: CurrentSession) -> MessageView:
    result: Final = await service.unlink(session, binding_id)
    if result:
        raise_public(result)
    return MessageView()


router.include_router(protected)


def callback_redirect(path: str) -> RedirectResponse:
    return RedirectResponse(
        path, status_code=303, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
    )


@router.get("/oauth/{provider}/callback", response_class=RedirectResponse)
async def oauth_callback(provider: ProviderID, request: Request, service: Service, client: OAuth) -> RedirectResponse:
    query: Final = request.query_params
    state: Final = query.get("state", "")
    flow: Final = await service.take_flow(provider, state, request.cookies.get(cookie_name(service, "browser"), ""))
    if flow is None:
        return callback_redirect("/account/login/?error=invalid_authorization")
    code: Final = query.get("code", "")
    config: Final = service.settings.provider(provider)
    if query.get("error") or not code or len(code) > 2048 or config is None:
        return callback_redirect("/account/login/?error=authorization_cancelled")
    identity: Final = await client.exchange(config, code, flow)
    if isinstance(identity, AuthError):
        return callback_redirect("/account/login/?" + urlencode({"error": identity.code}))
    old: Final = request.cookies.get(cookie_name(service, "session"))
    result: Final = await service.finish_oauth(flow, identity, await service.session(old))
    if isinstance(result, AuthError):
        return callback_redirect("/account/login/?" + urlencode({"error": result.code}))
    if isinstance(result, str):
        return callback_redirect(result)
    response: Final = callback_redirect(result.return_path)
    if old:
        await service.logout(old)
    set_cookie(response, service, "session", result.token, 604800)
    return response


from litellm.proxy.commerce.wallet_routes import router as wallet_router

router.include_router(wallet_router)

from litellm.proxy.commerce.payment_routes import router as payment_router

router.include_router(payment_router)

from litellm.proxy.commerce.gateway_routes import router as gateway_router

router.include_router(gateway_router)
