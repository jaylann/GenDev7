import os
import sys

from loguru import logger
from pathlib import Path

# Determine environment and log level
ENV = os.getenv("ENV", "production").lower()
DEFAULT_LEVEL = "DEBUG" if ENV in ("development", "staging") else "INFO"
LOG_LEVEL = os.getenv("LOG_LEVEL", DEFAULT_LEVEL).upper()

# Remove any default handlers
logger.remove()

# Single console sink: always log to stdout and stderr
logger.add(
    sys.stdout,
    level=LOG_LEVEL,
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
    backtrace=True,
    diagnose=True,
    enqueue=True,
)
