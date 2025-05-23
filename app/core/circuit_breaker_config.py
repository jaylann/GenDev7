from dataclasses import dataclass


@dataclass
class CircuitBreakerConfig:
    """Configuration settings for circuit breaker behavior."""

    # Lenient cause apis usually fail fast
    failure_threshold: int = 5         # Number of failures before opening

    # Quick recovery so user experience is not affected
    recovery_timeout: float = 5.0     # Time in seconds before attempting recovery

    # Assume the circuit is immediately healthy after a successful request
    health_threshold: int = 1          # Successful requests needed to close circuit

    # Low timeout to avoid missing offers
    reset_timeout: float = 20.0        # Time in seconds before resetting failure count