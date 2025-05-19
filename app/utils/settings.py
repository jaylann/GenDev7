"""
Application configuration settings loader.

Provides a cached Settings instance for dependency injection in FastAPI.
"""

from functools import lru_cache

from app.core import Settings


@lru_cache
def get_settings() -> Settings:
    """
    Get and cache the application Settings instance.

    Returns:
        Settings: Configuration loaded from environment variables.
    """
    return Settings()
