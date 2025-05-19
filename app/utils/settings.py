from functools import lru_cache

from app.core import Settings


@lru_cache
def get_settings() -> Settings:  # FastAPI caches deps automatically too
    """
    Retrieve and cache the application Settings instance.

    Returns:
        Settings: Configuration settings loaded from environment.
    """
    return Settings()
