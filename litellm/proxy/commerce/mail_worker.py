import asyncio
import logging
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Final
from urllib.parse import urlencode

from prisma import Prisma
from prisma.types import DatasourceOverride

from litellm.models.commerce_auth import MailPayload
from litellm.proxy.commerce.config import AccountSettings, load_settings
from litellm.proxy.commerce.security import AuthSecurity
from litellm.repositories.commerce_auth_repository import MailRepository


def send_mail(settings: AccountSettings, payload: MailPayload) -> None:
    page: Final = "verify" if payload.purpose == "verify" else "reset-password"
    url: Final = f"{settings.public_url}/account/{page}/#" + urlencode({"token": payload.token})
    message: Final = EmailMessage()
    message["Subject"] = "CocaAPI 邮箱验证" if payload.purpose == "verify" else "CocaAPI 重置密码"
    message["From"] = settings.smtp_from
    message["To"] = payload.email
    message.set_content(f"请打开下方链接完成操作：\n\n{url}\n\n链接仅可使用一次。如果不是你本人操作，请忽略此邮件。")
    context: Final = ssl.create_default_context()
    with (
        smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20)
        if settings.smtp_security == "tls"
        else smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
    ) as smtp:
        if settings.smtp_security == "starttls":
            smtp.starttls(context=context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        smtp.send_message(message)


async def deliver_one(repository: MailRepository, security: AuthSecurity, settings: AccountSettings) -> None:
    now: Final = datetime.now(timezone.utc)
    job: Final = await repository.claim(now)
    if job is None:
        await repository.cleanup(now)
        await asyncio.sleep(5)
        return
    payload: Final = security.open_mail(job.payload)
    if payload is None or not await repository.valid(
        security.digest(payload.token, payload.purpose), payload.purpose, payload.email, now
    ):
        await repository.finish(job, now, True)
        return
    try:
        await asyncio.to_thread(send_mail, settings, payload)
        await repository.finish(job, now, True)
    except (smtplib.SMTPException, OSError):
        logging.getLogger(__name__).warning("Account email delivery failed; retry scheduled")
        await repository.finish(job, now, False)


async def run() -> None:
    settings: Final = load_settings()
    if settings is None or not settings.email_ready:
        raise SystemExit("Configure account authentication and SMTP before starting the mail worker")
    database: Final = Prisma(datasource=DatasourceOverride(url=os.environ["DATABASE_URL"]))
    await database.connect()
    repository: Final = MailRepository(database)
    security: Final = AuthSecurity(settings.secret.get_secret_value())
    try:
        while True:
            await deliver_one(repository, security, settings)
    finally:
        await database.disconnect()


if __name__ == "__main__":
    asyncio.run(run())
