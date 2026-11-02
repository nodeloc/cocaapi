from collections.abc import Mapping
from typing import Final

from litellm.exceptions import SensitiveDataRouteException
from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth


class DeferredBillingReroute(CustomLogger):
    async def async_pre_call_hook(
        self, user_api_key_dict: UserAPIKeyAuth, cache: object, data: Mapping[str, object], call_type: str
    ) -> None:
        if "reroute-expensive" in str(data.get("messages")):
            raise SensitiveDataRouteException(
                route_to_model="wallet-expensive-model",
                session_id="billing-test",
                sticky_session_routing=False,
            )


billing_reroute: Final = DeferredBillingReroute()
