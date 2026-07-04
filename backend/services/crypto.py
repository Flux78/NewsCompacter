import os
import logging
from pathlib import Path
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_KEY_PATH = Path(__file__).resolve().parent.parent / ".encryption_key"


def _load_or_create_key() -> bytes:
    env_key = os.environ.get("NC_ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()

    if _KEY_PATH.exists():
        return _KEY_PATH.read_bytes()

    key = Fernet.generate_key()
    _KEY_PATH.write_bytes(key)
    _KEY_PATH.chmod(0o600)
    logger.info("Generated new encryption key at %s", _KEY_PATH)
    return key


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    f = Fernet(_load_or_create_key())
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    f = Fernet(_load_or_create_key())
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        return ciphertext


def is_encrypted(value: str) -> bool:
    return value.startswith("gAAAAA")
