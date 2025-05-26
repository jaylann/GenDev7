from __future__ import annotations

import asyncio
import time
from typing import List, Any

import httpx
import pytest
from hypothesis import given
from hypothesis import settings, HealthCheck
from hypothesis import strategies as st
from tenacity.wait import wait_fixed

from app.core import RetryConfig
from app.core.circuit_breaker import circuit_protected
from app.core.circuit_breaker import get_circuit_breaker, reset_all_breakers
from app.exceptions import ProviderError
from app.models import Address, Offer
from app.models.base.circuit_state import CircuitState
from app.providers.base import ProviderBase


class DummyProvider(ProviderBase):
    """Concrete provider used for retry & circuit-breaker tests."""

    name = "DummyProvider"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        failures_before_success: int = 0,
        retry_config: RetryConfig | None = None,
    ) -> None:
        super().__init__(client, retry_config=retry_config)
        self._failures_before_success = failures_before_success
        self.call_count = 0

    # keep CB protection
    @circuit_protected
    async def fetch(
        self,
        address: Address,
    ) -> List[Offer]:
        self.call_count += 1
        if self.call_count <= self._failures_before_success:
            raise ProviderError("forced failure")
        # Unvalidated stub – avoids filling every required field.
        # Pydantic v2's `model_construct` constructs an *unvalidated* instance
        return [Offer.model_construct()]


@pytest.fixture(scope="session")
def dummy_address() -> Address:
    """Return a syntactically valid German address for every test."""
    return Address(
        street="Teststraße",
        house_number="1",
        city="Berlin",
        plz="10115",
        country_code="DE",
    )


FAST_WAIT = wait_fixed(0)  # no wait between attempts


@pytest.fixture(autouse=True)
def _reset_breakers() -> None:
    """Ensure global CB registry is pristine between tests."""
    yield
    reset_all_breakers()


@pytest.fixture(scope="session")
def httpx_client() -> httpx.AsyncClient:
    """A harmless AsyncClient instance for all tests."""
    return httpx.AsyncClient(base_url="http://example")


# Retry logic – deterministic cases
@pytest.mark.asyncio
async def test_success_without_retry(httpx_client, dummy_address):
    provider = DummyProvider(
        httpx_client,
        failures_before_success=0,
        retry_config=RetryConfig(max_attempts=3, wait=FAST_WAIT),
    )
    offers = await provider(dummy_address)

    assert offers, "Should return non-empty offer list"
    assert provider.call_count == 1, "No retries expected on immediate success"


@pytest.mark.asyncio
async def test_retry_until_success(httpx_client, dummy_address):
    attempts, failures = 5, 3
    cfg = RetryConfig(max_attempts=attempts, wait=FAST_WAIT)
    provider = DummyProvider(
        httpx_client, failures_before_success=failures, retry_config=cfg
    )

    offers = await provider(dummy_address)

    assert offers  # success eventually
    assert provider.call_count == failures + 1  # fail N times, succeed once
    # ensure we never exceeded configured attempts
    assert provider.call_count <= attempts


@pytest.mark.asyncio
async def test_retry_exhaustion_raises(httpx_client, dummy_address):
    attempts = 3
    cfg = RetryConfig(max_attempts=attempts, wait=FAST_WAIT)
    provider = DummyProvider(
        httpx_client, failures_before_success=float("inf"), retry_config=cfg
    )

    with pytest.raises(ProviderError):
        await provider(dummy_address)

    assert provider.call_count == attempts, "Fetch tried exactly max_attempts times"


# Retry logic – property-based fuzzing
@settings(
    deadline=None,
    max_examples=25,
    suppress_health_check=(HealthCheck.function_scoped_fixture,),
)
@given(
    max_attempts=st.integers(min_value=1, max_value=6),
    failures=st.integers(min_value=0, max_value=6),
)
def test_retry_property(max_attempts: int, failures: int, httpx_client, dummy_address):
    """
    * If failures < max_attempts  -> provider must eventually succeed.
    * If failures >= max_attempts -> provider must raise ProviderError.
    The number of fetch invocations must never exceed max_attempts.
    """
    cfg = RetryConfig(max_attempts=max_attempts, wait=FAST_WAIT)
    provider = DummyProvider(
        httpx_client, failures_before_success=failures, retry_config=cfg
    )
    # Ensure the circuit does **not** open during this run
    breaker = get_circuit_breaker(provider.name)
    breaker.state = CircuitState.CLOSED
    breaker.failure_count = 0
    breaker.config.failure_threshold = max_attempts + 10  # safely above any failures

    async def scenario() -> Any:
        if failures < max_attempts:
            assert await provider(dummy_address)  # should succeed
        else:
            with pytest.raises(ProviderError):
                await provider(dummy_address)

    asyncio.run(scenario())
    assert provider.call_count <= max_attempts


# RetryConfig – alias behaviour
def test_retry_config_max_attempts_alias():
    cfg = RetryConfig(max_attempts=7)
    # Tenacity's StopAfterAttempt exposes max_attempt_number
    assert cfg.stop.max_attempt_number == 7


# Circuit-breaker integration
@pytest.mark.asyncio
async def test_circuit_open_short_circuits(httpx_client, dummy_address):
    provider = DummyProvider(httpx_client, failures_before_success=0)

    # Manually force the breaker open
    breaker = get_circuit_breaker(provider.name)
    breaker.state = CircuitState.OPEN
    breaker.last_state_change = time.time()  # ensure “just now”
    breaker.config.recovery_timeout = 9999  # well beyond test duration

    offers = await provider(dummy_address)

    assert offers == [], "Open circuit must skip fetch and return empty list"
    assert provider.call_count == 0, "Fetch must not be executed when circuit is open"
