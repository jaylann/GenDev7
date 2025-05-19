"""
Module for configuring Tenacity retry behavior via a Pydantic model.
"""

from typing import Any, Optional


from pydantic import BaseModel, Field, ConfigDict
from tenacity.retry import retry_base, retry_if_exception_type
from tenacity.stop import stop_base, stop_after_attempt
from tenacity.wait import wait_base, wait_exponential

 # Pydantic model for configuring retry behavior with Tenacity
class RetryConfig(BaseModel):
    """
    Pydantic model encapsulating Tenacity retry configuration.

    Attributes:
        stop: Strategy to determine when to stop retrying.
        wait: Strategy for wait/backoff between retries.
        retry: Condition under which to retry.
        reraise: Whether to reraise the final exception.
        max_attempts: Optional alias for stop_after_attempt.
    """

    # Allow non-Pydantic types (tenacity stops, waits, retries)
    model_config = ConfigDict(arbitrary_types_allowed=True)

    stop: stop_base = Field(
        default_factory=lambda: stop_after_attempt(4),
        description="Stop after this many attempts",
    )
    wait: wait_base = Field(
        default_factory=lambda: wait_exponential(multiplier=0.5, min=0.1, max=1),
        description="Exponential backoff between retries",
    )
    retry: retry_base = Field(
        default_factory=lambda: retry_if_exception_type(Exception),
        description="Retry on these exception types",
    )
    reraise: bool = Field(
        default=True, description="Reraise last exception after retries are exhausted"
    )
    max_attempts: Optional[int] = Field(
        None, description="If provided, aliases stop_after_attempt"
    )

    def __init__(self, **data: Any) -> None:
        """
        Initialize the RetryConfig model.

        Overrides the stop strategy if `max_attempts` is explicitly set.
        """
        super().__init__(**data)
        # Override the stop strategy when max_attempts is provided
        if self.max_attempts is not None:
            self.stop = stop_after_attempt(self.max_attempts)
