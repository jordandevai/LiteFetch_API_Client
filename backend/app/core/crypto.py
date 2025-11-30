import base64
import secrets
from typing import Tuple, Union

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# --- Parameters ---
KDF_NAME = "pbkdf2-sha512"
MASTER_MODE = "master"
KDF_ITERS = 600_000
KEY_LEN = 32
SALT_LEN = 16
IV_LEN = 12
VERSION = "v1"


class CryptoError(Exception):
    pass


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA512(), length=KEY_LEN, salt=salt, iterations=KDF_ITERS)
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_value(plaintext: str, key: Union[str, bytes]) -> str:
    """
    Supports two modes:
    - legacy: passphrase string → PBKDF2-derived key (keeps existing ciphertexts compatible)
    - master: raw 32-byte key → direct AES-GCM without KDF
    """
    iv = secrets.token_bytes(IV_LEN)
    if isinstance(key, str):
        salt = secrets.token_bytes(SALT_LEN)
        aes_key = _derive_key(key, salt)
        kdf_name = KDF_NAME
        iterations = KDF_ITERS
        salt_b64 = base64.b64encode(salt).decode("utf-8")
    else:
        if len(key) != KEY_LEN:
            raise CryptoError("invalid master key length")
        aes_key = key
        kdf_name = MASTER_MODE
        iterations = 0
        salt_b64 = ""  # unused in master mode

    aes = AESGCM(aes_key)
    ct = aes.encrypt(iv, plaintext.encode("utf-8"), None)  # includes tag
    payload = "|".join(
        [
            VERSION,
            kdf_name,
            str(iterations),
            salt_b64,
            base64.b64encode(iv).decode("utf-8"),
            base64.b64encode(ct).decode("utf-8"),
        ]
    )
    return "enc:" + payload


def _parse_encrypted(value: str) -> Tuple[str, str, int, bytes, bytes, bytes]:
    if not value.startswith("enc:"):
        raise CryptoError("not encrypted")
    body = value[len("enc:") :]
    parts = body.split("|")
    if len(parts) != 6:
        raise CryptoError("invalid payload format")
    version, kdf_name, iter_str, salt_b64, iv_b64, ct_b64 = parts
    try:
        iterations = int(iter_str)
        salt = base64.b64decode(salt_b64) if salt_b64 else b""
        iv = base64.b64decode(iv_b64)
        ct = base64.b64decode(ct_b64)
    except Exception as exc:
        raise CryptoError("invalid payload encoding") from exc
    if version != VERSION:
        raise CryptoError("unsupported version")
    if kdf_name not in (KDF_NAME, MASTER_MODE):
        raise CryptoError("unsupported kdf")
    if kdf_name == KDF_NAME:
        if len(salt) != SALT_LEN or iterations != KDF_ITERS:
            raise CryptoError("invalid salt/iteration")
    if len(iv) != IV_LEN:
        raise CryptoError("invalid iv length")
    return version, kdf_name, iterations, salt, iv, ct


def _normalize_master_key(key: Union[str, bytes]) -> bytes:
    if isinstance(key, bytes):
        candidate = key
    else:
        try:
            candidate = bytes.fromhex(key)
        except Exception as exc:
            raise CryptoError("invalid master key encoding") from exc
    if len(candidate) != KEY_LEN:
        raise CryptoError("invalid master key length")
    return candidate


def decrypt_value(encrypted: str, key: Union[str, bytes]) -> str:
    _, kdf_name, _, salt, iv, ct = _parse_encrypted(encrypted)
    if kdf_name == MASTER_MODE:
        aes_key = _normalize_master_key(key)
    else:
        if not isinstance(key, str):
            raise CryptoError("passphrase required for legacy ciphertext")
        aes_key = _derive_key(key, salt)
    aes = AESGCM(aes_key)
    try:
        pt = aes.decrypt(iv, ct, None)
    except Exception as exc:
        raise CryptoError("decryption failed") from exc
    return pt.decode("utf-8")
