import os
import sys

from loguru import logger

# Configure loguru logger for production
logger.remove()
logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "DEBUG"), backtrace=False, diagnose=False, enqueue=True)
