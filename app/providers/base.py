# app/providers/base.py
from __future__ import annotations

import abc
from typing import List, Dict, Any

import httpx
from loguru import logger
from tenacity import AsyncRetrying

from app.core.retry_config import RetryConfig
from app.exceptions.provider_error import ProviderError
from app.models import Address, Offer


class ProviderBase(abc.ABC):
    """
    Base class for all provider adapters. Subclasses must implement `fetch`.
    Wraps `fetch` in a Tenacity retry loop using `retry_config`.
    """

    name: str  # override in subclass, e.g. "WebWunder"

    # default retry settings; can be overridden per-class or per-instance
    retry_config: RetryConfig = RetryConfig()

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
    ) -> None:
        self.client = client
        if retry_config is not None:
            self.retry_config = retry_config

    async def __call__(self, address: Address) -> List[Offer]:
        """
        Entry point that wraps `self.fetch` in a Tenacity retry loop.
        """
        settings: Dict[str, Any] = self.retry_config.model_dump()
        logger.debug(f"Provider {self.name} retry settings: {settings}")

        retryer: AsyncRetrying = AsyncRetrying(
            stop=self.retry_config.stop,
            wait=self.retry_config.wait,
            retry=self.retry_config.retry,
            reraise=self.retry_config.reraise,
        )

        async for attempt in retryer:
            with attempt:
                return await self.fetch(address)

        # if reraise=False, this will be reached
        raise ProviderError(f"Exhausted retries for {self.name}")

    @abc.abstractmethod
    async def fetch(self, address: Address) -> List[Offer]:  # pragma: no cover
        """
        Perform provider-specific lookup. Raise ProviderError on failure.
        """
        ...
