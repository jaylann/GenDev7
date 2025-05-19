"""
Abstract framework for provider adapters with retry support.

Defines a base class that handles retrying failed lookups using Tenacity
and delegates actual data retrieval to subclass-implemented `fetch`.
"""

from __future__ import annotations

import abc
from typing import List, Dict, Any

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type

from app.core import RetryConfig
from app.exceptions import ProviderError
from app.models import Address, Offer
from app.utils import logger


class ProviderBase(abc.ABC):
    """
    Abstract base class for network service provider adapters.

    Provides a retry-wrapped entry point and requires subclasses to implement
    provider-specific fetch logic.
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
        """
        Initialize the provider adapter.

        Args:
            client (httpx.AsyncClient): HTTP client for making requests.
            retry_config (Optional[RetryConfig]): Custom retry settings;
                defaults to class-level `retry_config` if not provided.
        """
        self.client = client
        if retry_config is not None:
            self.retry_config = retry_config

    async def __call__(self, address: Address) -> List[Offer]:
        """
        Execute provider fetch within a retry loop.

        Wraps the `fetch` method in Tenacity retry logic using configured settings.

        Args:
            address (Address): Target address for the provider lookup.

        Returns:
            List[Offer]: Offers returned by the provider.

        Raises:
            ProviderError: If retries are exhausted and error is reraised.
        """
        settings: Dict[str, Any] = self.retry_config.model_dump()
        logger.debug(f"Provider {self.name} retry settings: {settings}")

        retryer: AsyncRetrying = AsyncRetrying(
            stop=self.retry_config.stop,
            wait=self.retry_config.wait,
            retry=retry_if_exception_type((ProviderError, httpx.HTTPError)),
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
        Perform the provider-specific data retrieval.

        Subclasses must implement this to fetch offers for the given address.

        Args:
            address (Address): The address to look up.

        Returns:
            List[Offer]: List of offers from this provider.

        Raises:
            ProviderError: If the lookup fails or response is invalid.
        """
        ...
