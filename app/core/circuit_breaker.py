"""
Circuit breaker pattern implementation for provider resilience.

Prevents repeated calls to failing services, automatically recovers,
and provides graceful degradation under error conditions.
"""

from dataclasses import dataclass
from enum import Enum
import time
from typing import Dict, Optional, List, Any, Callable
import functools

from app.utils.logger import logger


class CircuitState(Enum):
    """Circuit breaker state machine states."""
    CLOSED = "CLOSED"     # Normal operation
    OPEN = "OPEN"         # Not allowing requests
    HALF_OPEN = "HALF_OPEN"  # Testing if service is back


@dataclass
class CircuitBreakerConfig:
    """Configuration settings for circuit breaker behavior."""
    failure_threshold: int = 5         # Number of failures before opening
    recovery_timeout: float = 5.0     # Time in seconds before attempting recovery
    health_threshold: int = 1          # Successful requests needed to close circuit
    reset_timeout: float = 20.0        # Time in seconds before resetting failure count


class CircuitBreaker:
    """Circuit breaker to prevent repeated calls to failing services."""
    
    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        """
        Initialize circuit breaker with provider name and optional config.
        
        Args:
            name: Provider identifier
            config: Optional configuration settings, uses defaults if not provided
        """
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.last_state_change = time.time()
        self.successful_health_count = 0
    
    def record_failure(self) -> None:
        """Record a failure and potentially open the circuit."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.state == CircuitState.CLOSED and self.failure_count >= self.config.failure_threshold:
            self.state = CircuitState.OPEN
            self.last_state_change = time.time()
            logger.warning(f"Circuit breaker for {self.name} is now OPEN")
    
    def record_success(self) -> None:
        """Record a success and potentially close the circuit."""
        if self.state == CircuitState.HALF_OPEN:
            self.successful_health_count += 1
            if self.successful_health_count >= self.config.health_threshold:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.successful_health_count = 0
                self.last_state_change = time.time()
                logger.info(f"Circuit breaker for {self.name} is now CLOSED")
        
        # Reset failure count if we've been good for a while
        if (self.state == CircuitState.CLOSED and 
            self.failure_count > 0 and
            (time.time() - self.last_failure_time) > self.config.reset_timeout):
            self.failure_count = 0
            logger.debug(f"Reset failure count for {self.name}")
    
    def is_allowed(self) -> bool:
        """
        Check if a request should be allowed.
        
        Returns:
            True if the request is allowed, False if the circuit is open
        """
        now = time.time()
        
        if self.state == CircuitState.OPEN:
            # Check if recovery timeout has elapsed to transition to half-open
            if (now - self.last_state_change) > self.config.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.last_state_change = now
                self.successful_health_count = 0
                logger.info(f"Circuit breaker for {self.name} is now HALF_OPEN")
                return True
            return False
        
        # Always allow requests in CLOSED or HALF_OPEN states
        return True


# Global registry of circuit breakers
_breakers: Dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """
    Get or create a circuit breaker for a provider.
    
    Args:
        name: Provider identifier
        
    Returns:
        The circuit breaker instance
    """
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(name)
    return _breakers[name]


def reset_all_breakers() -> None:
    """Reset all circuit breakers to closed state (for testing)."""
    for breaker in _breakers.values():
        breaker.state = CircuitState.CLOSED
        breaker.failure_count = 0
        breaker.successful_health_count = 0


# Decorator for protecting provider fetch methods
def circuit_protected(func):
    """
    Decorator to apply circuit breaker protection to provider fetch methods.
    
    Returns empty list when circuit is open to ensure graceful degradation.
    """
    @functools.wraps(func)
    async def wrapper(self, *args, **kwargs):
        # Extract provider name from the class
        provider_name = getattr(self, "name", self.__class__.__name__)
        breaker = get_circuit_breaker(provider_name)
        
        if not breaker.is_allowed():
            logger.warning(f"Circuit open for {provider_name}, skipping request")
            return []
        
        try:
            result = await func(self, *args, **kwargs)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            logger.error(f"Circuit breaker caught error from {provider_name}: {str(e)}")
            raise
    
    return wrapper