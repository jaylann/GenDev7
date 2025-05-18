from typing import List, Optional

from app.models import Address
from pydantic import Field


class WsCompareAddressRequest(Address):
    """
    Request model extending Address for WebSocket compare: includes optional provider filters and fiber preference.
    """
    providers: Optional[List[str]] = Field(
        None,
        description="List of provider names to include in the comparison, or None for all providers",
        examples=[["WebWunder", "ByteMe", "PingPerfect"]]
    )
    wants_fiber: Optional[bool] = Field(
        False,
        description="Whether fiber connectivity is desired",
        examples=[True]
    )
