from __future__ import annotations

from typing import Any, Callable

from tenacity import (retry, stop_after_attempt, wait_exponential, retry_if_exception_type, )


def async_retry(*, attempts: int = 3, exp_base: float = 0.5, exp_max: float = 4.0,
        exc: type[Exception] | tuple[type[Exception], ...] = Exception, ) -> Callable[[Callable[..., Any]], Any]:
    """

    Parameters
    ----------
    attempts : int
        How many tries before giving up.
    exp_base : float
        Initial back-off in seconds.
    exp_max : float
        Maximum back-off.
    exc : Exception or tuple
        Exception(s) that trigger a retry.
    """
    return retry(reraise=True, stop=stop_after_attempt(attempts),
        wait=wait_exponential(multiplier=exp_base, max=exp_max), retry=retry_if_exception_type(exc), )
