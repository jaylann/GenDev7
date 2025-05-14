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

# Ensure the log directory exists
log_dir = Path(os.getenv("LOG_DIR", "logs"))
log_dir.mkdir(parents=True, exist_ok=True)

# Console sink: colored for development/staging, plain for production
if ENV in ("development", "staging"):
    logger.add(
        sys.stderr,
        level=LOG_LEVEL,
        colorize=True,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
            "<level>{message}</level>"
        ),
        backtrace=True,
        diagnose=True,
        enqueue=True,
    )
else:
    logger.add(
        sys.stderr,
        level=LOG_LEVEL,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
        backtrace=False,
        diagnose=False,
        enqueue=True,
    )

# File sink: daily rotation, 30-day retention, compressed, human-readable
log_file = log_dir / "app_{time:YYYY-MM-DD}.log"
logger.add(
    str(log_file),
    level=LOG_LEVEL,
    rotation="00:00",
    retention="30 days",
    compression="zip",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
    backtrace=False,
    diagnose=False,
    enqueue=True,
)

# Optional JSON sink for structured logging (enable by setting LOG_JSON=true)
if os.getenv("LOG_JSON", "false").lower() == "true":
    json_file = log_dir / "app_{time:YYYY-MM-DD}.json"
    logger.add(
        str(json_file),
        level=LOG_LEVEL,
        rotation="00:00",
        retention="30 days",
        compression="zip",
        serialize=True,
        backtrace=False,
        diagnose=False,
        enqueue=True,
    )
