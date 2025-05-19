import asyncio
from typing import List, Optional, Callable, Any, Dict, Generator
from unittest.mock import (
    MagicMock,
)

import httpx
import pytest
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.testclient import TestClient
load_dotenv(".env.test")

from app.core import Settings
from app.models import Offer, Address
from app.providers import ServusSpeedProvider
from app.providers.base import ProviderBase
from app.services import cache_set
from app.services.caching_service import _cache
from app.utils import get_settings, encode
from app.utils import logger
from main import app as fastapi_app


@pytest.fixture(scope="session")
def event_loop():
    """Provide an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_settings() -> Settings:
    """
    Provides a Settings instance with test-specific overrides.
    Ensure all required environment variables for Settings are faked if not using a .env for tests.
    """
    # Clear lru_cache for get_settings if it's active in the app itself
    get_settings.cache_clear()

    return Settings(
        webwunder_api_key="test_key_placeholder",
        byteme_api_key="test_key_placeholder",
        pingperfect_client_id="test_id_placeholder",
        pingperfect_secret="test_secret_placeholder",
        servusspeed_username="test_user_placeholder",
        servusspeed_password="test_pass_placeholder",
        verbyndich_api_key="test_key_placeholder",
        cache_ttl_seconds=5,  # Short TTL for cache expiry tests
    )


@pytest.fixture
def app_instance(test_settings: Settings) -> FastAPI:
    """
    Provides the FastAPI application instance with overridden settings.
    """
    fastapi_app.dependency_overrides[get_settings] = lambda: test_settings
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def client(app_instance: FastAPI) -> Generator[TestClient, None, None]:
    """
    Provides a TestClient for making HTTP requests to the application.
    """
    with TestClient(app_instance) as c:
        yield c


@pytest.fixture(autouse=True)
def clear_global_cache() -> None:
    """
    Automatically clears the global API cache before each test.
    """
    _cache.clear()
    # logger.debug("Global API cache cleared for test.") # Optional: for debugging test setup


# --- Mock Provider Fixtures ---


class MockConcreteProvider(ProviderBase):
    """
    A mock provider that behaves like a concrete provider for testing.
    It simulates network delays and success/failure scenarios.
    """

    def __init__(
        self,
        name: str,
        offers_to_return: List[Offer],
        should_succeed: bool = True,
        call_delay: float = 0.0,
    ):
        super().__init__(name=name)  # Assumes ProviderBase.__init__(self, name: str)
        # Deep copy offer data to prevent modification across tests/calls
        self.offers_to_return_data: List[Dict[str, Any]] = [
            o.model_dump() for o in offers_to_return
        ]
        self.should_succeed: bool = should_succeed
        self.call_delay: float = call_delay
        self.client: Optional[httpx.AsyncClient] = (
            None  # Will be set by _execute_provider_fetch
        )

    async def __call__(self, address: Address) -> List[Offer]:
        """Simulates fetching offers from a provider."""
        logger.debug(
            f"MockProvider '{self.name}' called with delay {self.call_delay}s. Success: {self.should_succeed}"
        )
        await asyncio.sleep(self.call_delay)
        if not self.should_succeed:
            logger.error(
                f"MockProvider '{self.name}' raising configured exception."
            )
            raise ValueError(f"Mock provider {self.name} failed as configured.")
        logger.info(
            f"MockProvider '{self.name}' returning {len(self.offers_to_return_data)} offers."
        )
        return [Offer.model_validate(data) for data in self.offers_to_return_data]


@pytest.fixture
def mock_provider_factory() -> Callable[..., MockConcreteProvider]:
    """
    Factory fixture to create instances of MockConcreteProvider.
    """

    def _factory(
        name: str,
        offers_to_return: List[Offer],
        should_succeed: bool = True,
        call_delay: float = 0.0,
    ) -> MockConcreteProvider:
        return MockConcreteProvider(name, offers_to_return, should_succeed, call_delay)

    return _factory


@pytest.fixture
def mock_servusspeed_provider_instance_factory(
    test_settings: Settings,
) -> Callable[..., ServusSpeedProvider]:
    """
    Factory fixture to create ServusSpeedProvider instances with a mocked __call__ method.
    This ensures `isinstance(p, ServusSpeedProvider)` works as expected in the API.
    """

    def _factory(
        offers_to_return: Optional[List[Offer]] = None,
        should_succeed: bool = True,
        call_delay: float = 0.0,
    ) -> ServusSpeedProvider:

        # Instantiate ServusSpeedProvider. It needs a client and credentials.
        # The client passed here is temporary; _execute_provider_fetch sets its own.
        # Credentials from test_settings.
        dummy_client = MagicMock(
            spec=httpx.AsyncClient
        )  # httpx.AsyncClient() - if it doesn't make calls in init
        instance = ServusSpeedProvider(
            client=dummy_client,  # This client will be replaced by _shared_client in _execute_provider_fetch
            username=test_settings.servusspeed_username,
            password=test_settings.servusspeed_password,
        )

        # Ensure the instance has the correct name if not set by default or if customizable.
        # ServusSpeedProvider likely hardcodes its name, e.g., "ServusSpeed"
        # If ProviderBase allows name setting or ServusSpeedProvider does:
        # instance.name = "ServusSpeedMock" # Or use its actual name.

        offers_data_to_return = [o.model_dump() for o in (offers_to_return or [])]

        async def mock_call(address: Address) -> List[Offer]:
            logger.debug(
                f"Mocked ServusSpeedProvider ({instance.name}) __call__ invoked with delay {call_delay}s. Success: {should_succeed}"
            )
            await asyncio.sleep(call_delay)
            if not should_succeed:
                logger.error(
                    f"Mocked ServusSpeedProvider ({instance.name}) configured to fail."
                )
                raise ValueError(
                    f"Mocked ServusSpeedProvider ({instance.name}) failed as configured."
                )
            logger.info(
                f"Mocked ServusSpeedProvider ({instance.name}) returning {len(offers_data_to_return)} offers."
            )
            return [Offer.model_validate(data) for data in offers_data_to_return]

        instance.__call__ = mock_call  # Replace the actual call method with our mock
        return instance

    return _factory


# Helper to pre-populate cache for tests
async def set_cache_for_test(
    slug: str, offers: List[Offer], settings: Settings
) -> None:
    """Helper function to set items in the API's cache for testing purposes."""
    await cache_set(slug, offers, settings.cache_ttl_seconds)


def create_test_api_slug(payload_data: Dict[str, Any]) -> str:
    """Encodes a payload into a slug using the application's encode function."""
    return encode(payload_data)
