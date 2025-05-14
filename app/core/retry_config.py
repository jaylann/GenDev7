from typing import Optional

from pydantic import BaseModel, Field, ConfigDict
from tenacity.retry import retry_base, retry_if_exception_type
from tenacity.stop import stop_base, stop_after_attempt
from tenacity.wait import wait_base, wait_exponential


class RetryConfig(BaseModel):
    """
    Configuration model for Tenacity retry loops.

    Attributes
    ----------
    stop : StopBase
        When to stop retrying.
    wait : WaitBase
        Backoff strategy between retries.
    retry : RetryBase
        Which exceptions trigger a retry.
    reraise : bool
        Whether to reraise the last exception after retries are exhausted.
    max_attempts : Optional[int]
        Alias for stop_after_attempt; if set, will override `stop`.
    """

    # Allow non-Pydantic types (tenacity stops, waits, retries)
    model_config = ConfigDict(arbitrary_types_allowed=True)

    stop: stop_base = Field(
        default_factory=lambda: stop_after_attempt(3),
        description="Stop after this many attempts",
    )
    wait: wait_base = Field(
        default_factory=lambda: wait_exponential(multiplier=0.5, min=0.5, max=4),
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

    def __init__(self, **data):
        super().__init__(**data)
        # if max_attempts is explicitly set, override stop
        if self.max_attempts is not None:
            self.stop = stop_after_attempt(self.max_attempts)
