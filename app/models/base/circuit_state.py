from enum import Enum


class CircuitState(str, Enum):
    """Circuit breaker state machine states."""
    CLOSED = "CLOSED"     # Normal operation
    OPEN = "OPEN"         # Not allowing requests
    HALF_OPEN = "HALF_OPEN"  # Testing if service is back
