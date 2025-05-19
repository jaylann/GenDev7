"""
Provides a Pydantic model to configure Tenacity retry behavior.

Defines RetryConfig, which encapsulates stop, wait, and retry strategies,
with optional aliasing of max_attempts.
"""

from typing import Any, Optional


from pydantic import BaseModel, Field, ConfigDict
from tenacity.retry import retry_base, retry_if_exception_type
from tenacity.stop import stop_base, stop_after_attempt
from tenacity.wait import wait_base, wait_exponential

class RetryConfig(BaseModel):
    """
    Model for configuring Tenacity retry strategies.

    Encapsulates stop, wait, and retry behaviors, and optionally reraise
    exceptions. Use max_attempts to override the stop strategy.

    Attributes:
        stop (stop_base): Determines when to stop retrying.
        wait (wait_base): Backoff strategy between retries.
        retry (retry_base): Conditions under which to retry.
        reraise (bool): If True, raises the last exception after retries.
        max_attempts (Optional[int]): Alias for stop_after_attempt.
    """

    # Enable arbitrary Tenacity strategy types
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
        Initialize the model, overriding stop strategy if max_attempts is set.

        Args:
            **data: Initialization values, including optional max_attempts.
        """
        super().__init__(**data)
        if self.max_attempts is not None:
            self.stop = stop_after_attempt(self.max_attempts)
