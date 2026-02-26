import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models import HttpRequest, Environment, EnvironmentFile
from app.core.secret_transformers import (
    transform_request_for_encryption,
    transform_request_for_decryption,
    transform_environment_for_encryption,
    transform_environment_for_decryption,
    request_contains_encrypted_values,
    environment_contains_encrypted_values,
)


def test_request_decrypts_even_if_secret_flags_change():
    master = os.urandom(32)
    req = HttpRequest(
        headers={"Authorization": "Bearer token"},
        secret_headers={"Authorization": True},
        body="super-secret",
        secret_body=True,
    )

    enc = transform_request_for_encryption(req, master)
    assert request_contains_encrypted_values(enc)

    # Simulate user toggling secret flags off or key drift before load/decrypt.
    enc.secret_headers = {}
    enc.secret_body = False
    dec = transform_request_for_decryption(enc, master)

    assert dec.headers["Authorization"] == "Bearer token"
    assert dec.body == "super-secret"


def test_environment_decrypts_even_if_secret_map_changes():
    master = os.urandom(32)
    env = EnvironmentFile(
        active_env="default",
        envs={
            "default": Environment(
                name="default",
                variables={"API_KEY": "abc123"},
                secrets={"API_KEY": True},
            )
        },
    )

    enc_env = transform_environment_for_encryption(env, master)
    assert environment_contains_encrypted_values(enc_env)

    # Simulate secret map mismatch that previously stranded ciphertext.
    enc_env.envs["default"].secrets = {}
    dec_env = transform_environment_for_decryption(enc_env, master)
    assert dec_env.envs["default"].variables["API_KEY"] == "abc123"


def test_non_secret_values_remain_plaintext():
    master = os.urandom(32)
    req = HttpRequest(headers={"X-Trace": "abc"}, secret_headers={})
    out = transform_request_for_encryption(req, master)
    assert out.headers["X-Trace"] == "abc"
