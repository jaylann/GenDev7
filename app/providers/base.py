from __future__ import annotations

import abc
from typing import List

import httpx
from tenacity import (retry, wait_exponential, stop_after_attempt, retry_if_exception_type, )

from app.exceptions.provider_error import ProviderError
from app.models import Address, Offer


class ProviderBase(abc.ABC):
    """
    All provider adapters must inherit from this class and implement `fetch`.
    Each adapter receives a shared `httpx.AsyncClient`, injected by the
    FastAPI dependency layer.
    """

    name: str  # e.g. "WebWunder" – override in subclass

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    # Tenacity: 3 attempts, exponential back-off (½ s → 4 s)
    @retry(reraise=True, wait=wait_exponential(multiplier=0.5, min=0.5, max=4), stop=stop_after_attempt(3),
        retry=retry_if_exception_type(ProviderError), )
    async def __call__(self, address: Address) -> List[Offer]:
        """Entry-point called by aggregator; wraps `fetch` with retries."""
        return await self.fetch(address)

    # subclasses **must** supply their own implementation.
    @abc.abstractmethod
    async def fetch(self, address: Address) -> List[Offer]:  # pragma: no cover
        """
        Convert an Address → list[Offer] or raise ProviderError.
        """
        raise NotImplementedError
