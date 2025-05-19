"""
Logging configuration using Loguru.

Sets up a console sink with an environment-based log level, structured formatting,
and enhanced error diagnostics.
"""
import os
import sys

from loguru import logger

# Determine environment and log level
ENV = os.getenv("ENV", "production").lower()
DEFAULT_LEVEL = "DEBUG" if ENV in ("development", "staging") else "INFO"
LOG_LEVEL = os.getenv("LOG_LEVEL", DEFAULT_LEVEL).upper()

# Remove any default handlers
logger.remove()

# Configure Loguru console sink with environment-based level and structured formatting
logger.add(
    sys.stdout,
    level=LOG_LEVEL,
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
    backtrace=True,
    diagnose=True,
    enqueue=True,
)
