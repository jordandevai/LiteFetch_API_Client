import json
from typing import Any, Tuple

from app.core.crypto import encrypt_value, decrypt_value, is_encrypted_string, CryptoError


def is_ciphertext(value: Any) -> bool:
    return isinstance(value, str) and is_encrypted_string(value)


def encrypt_if_secret(value: Any, is_secret: bool, master_key: bytes | None) -> Any:
    if not master_key or not is_secret:
        return value
    if not isinstance(value, str):
        return value
    if is_encrypted_string(value):
        return value
    return encrypt_value(value, master_key)


def encrypt_json_if_secret(value: Any, is_secret: bool, master_key: bytes | None) -> Any:
    if not master_key or not is_secret:
        return value
    if isinstance(value, str):
        if is_encrypted_string(value):
            return value
        return encrypt_value(value, master_key)
    if isinstance(value, dict):
        try:
            return encrypt_value(json.dumps(value), master_key)
        except Exception:
            return value
    return value


def decrypt_if_ciphertext(value: Any, master_key: bytes | None) -> Tuple[Any, str | None]:
    if not master_key or not isinstance(value, str) or not is_encrypted_string(value):
        return value, None
    try:
        return decrypt_value(value, master_key), None
    except CryptoError as ex:
        return value, str(ex)


def decrypt_body_if_ciphertext(value: Any, master_key: bytes | None) -> Tuple[Any, str | None]:
    plain, err = decrypt_if_ciphertext(value, master_key)
    if err or not isinstance(plain, str):
        return plain, err
    try:
        return json.loads(plain), None
    except Exception:
        return plain, None
