"""
Secure credential management for provider API keys and authentication.

Prevents credentials from being exposed in memory as plain strings
and keeps them out of logs and error messages.
"""

import os
from typing import Dict, Optional

from pydantic import SecretStr

from app.utils.logger import logger


class CredentialManager:
    """
    Manages secure storage and retrieval of API credentials.

    Uses SecretStr for runtime protection of sensitive data.
    """

    # Store credentials in memory as SecretStr for runtime protection
    _credentials: Dict[str, SecretStr] = {}

    @classmethod
    def load_credentials_from_env(cls) -> None:
        """
        Load provider credentials from environment variables.
        """
        credential_keys = [
            "WEBWUNDER_API_KEY",
            "BYTEME_API_KEY",
            "PINGPERFECT_CLIENT_ID",
            "PINGPERFECT_SECRET",
            "SERVUSSPEED_USERNAME",
            "SERVUSSPEED_PASSWORD",
            "VERBYNDICH_API_KEY",
        ]

        for key in credential_keys:
            value = os.environ.get(key)
            if value:
                cls._credentials[key] = SecretStr(value)
            else:
                logger.warning(f"Missing credential: {key}")

    @classmethod
    def get_credential(cls, key: str) -> Optional[str]:
        """
        Get credential value by key.

        Args:
            key: Credential key (e.g., "WEBWUNDER_API_KEY")

        Returns:
            The credential value or None if not found
        """
        secret = cls._credentials.get(key)
        if secret:
            return secret.get_secret_value()
        return None
