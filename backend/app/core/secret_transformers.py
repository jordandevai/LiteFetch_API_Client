from typing import Any

from app.core.secret_codec import (
    decrypt_body_if_ciphertext,
    decrypt_if_ciphertext,
    encrypt_if_secret,
    encrypt_json_if_secret,
    is_ciphertext,
)


def transform_request_for_encryption(req: Any, master_key: bytes | None) -> Any:
    if not master_key:
        return req
    r = req.model_copy(deep=True)

    secret_headers = getattr(r, "secret_headers", {}) or {}
    r.headers = {
        k: encrypt_if_secret(v, bool(secret_headers.get(k)), master_key)
        for k, v in (r.headers or {}).items()
    }

    secret_q = getattr(r, "secret_query_params", {}) or {}
    next_q = []
    for row in r.query_params or []:
        row_copy = dict(row)
        key = row_copy.get("key") or ""
        row_copy["value"] = encrypt_if_secret(row_copy.get("value"), bool(secret_q.get(key)), master_key)
        next_q.append(row_copy)
    r.query_params = next_q

    secret_form = getattr(r, "secret_form_fields", {}) or {}
    next_form = []
    for row in r.form_body or []:
        row_copy = dict(row)
        key = row_copy.get("key") or ""
        row_type = (row_copy.get("type") or "text").lower()
        if row_type == "text":
            row_copy["value"] = encrypt_if_secret(row_copy.get("value"), bool(secret_form.get(key)), master_key)
        next_form.append(row_copy)
    r.form_body = next_form

    secret_auth = getattr(r, "secret_auth_params", {}) or {}
    r.auth_params = {
        k: encrypt_if_secret(v, bool(secret_auth.get(k)), master_key)
        for k, v in (r.auth_params or {}).items()
    }

    r.body = encrypt_json_if_secret(getattr(r, "body", None), bool(getattr(r, "secret_body", False)), master_key)
    return r


def transform_request_for_decryption(req: Any, master_key: bytes | None) -> Any:
    if not master_key:
        return req
    r = req

    # Decrypt ciphertext regardless of current secret flags so toggles/key renames
    # do not strand encrypted values.
    next_headers = {}
    for k, v in (r.headers or {}).items():
        dec, _ = decrypt_if_ciphertext(v, master_key)
        next_headers[k] = dec
    r.headers = next_headers

    next_q = []
    for row in r.query_params or []:
        row_copy = dict(row)
        dec, _ = decrypt_if_ciphertext(row_copy.get("value"), master_key)
        row_copy["value"] = dec
        next_q.append(row_copy)
    r.query_params = next_q

    next_form = []
    for row in r.form_body or []:
        row_copy = dict(row)
        row_type = (row_copy.get("type") or "text").lower()
        if row_type == "text":
            dec, _ = decrypt_if_ciphertext(row_copy.get("value"), master_key)
            row_copy["value"] = dec
        next_form.append(row_copy)
    r.form_body = next_form

    next_auth = {}
    for k, v in (r.auth_params or {}).items():
        dec, _ = decrypt_if_ciphertext(v, master_key)
        next_auth[k] = dec
    r.auth_params = next_auth

    body_dec, _ = decrypt_body_if_ciphertext(getattr(r, "body", None), master_key)
    r.body = body_dec
    return r


def request_contains_encrypted_values(req: Any) -> bool:
    for _, v in (getattr(req, "headers", {}) or {}).items():
        if is_ciphertext(v):
            return True

    for row in getattr(req, "query_params", []) or []:
        if is_ciphertext((row or {}).get("value")):
            return True

    for row in getattr(req, "form_body", []) or []:
        row_type = ((row or {}).get("type") or "text").lower()
        if row_type == "text" and is_ciphertext((row or {}).get("value")):
            return True

    for _, v in (getattr(req, "auth_params", {}) or {}).items():
        if is_ciphertext(v):
            return True

    if is_ciphertext(getattr(req, "body", None)):
        return True
    return False


def transform_environment_for_encryption(env_file: Any, master_key: bytes | None) -> Any:
    if not master_key:
        return env_file
    env_copy = env_file.model_copy(deep=True)
    for env_obj in env_copy.envs.values():
        secrets_map = getattr(env_obj, "secrets", {}) or {}
        for key, is_secret in secrets_map.items():
            if not is_secret:
                continue
            env_obj.variables[key] = encrypt_if_secret(env_obj.variables.get(key), True, master_key)
    return env_copy


def transform_environment_for_decryption(env_file: Any, master_key: bytes | None) -> Any:
    if not master_key:
        return env_file
    # Decrypt ciphertext regardless of secret map to prevent orphaned ciphertext.
    for env_obj in env_file.envs.values():
        for key, val in (env_obj.variables or {}).items():
            dec, _ = decrypt_if_ciphertext(val, master_key)
            env_obj.variables[key] = dec
    return env_file


def environment_contains_encrypted_values(env_file: Any) -> bool:
    for env_obj in env_file.envs.values():
        for _, val in (env_obj.variables or {}).items():
            if is_ciphertext(val):
                return True
    return False
