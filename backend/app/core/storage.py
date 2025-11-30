import base64
import json
import os
import secrets
import shutil
import time
import json as jsonlib
from pathlib import Path
from typing import Any, List, Dict, Optional, Tuple
from uuid import uuid4

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.models import (
    Collection,
    CollectionMeta,
    CollectionBundle,
    EnvironmentFile,
    RequestResult,
)
from app.core.crypto import (
    encrypt_value,
    decrypt_value,
    CryptoError,
    _derive_key,
    _parse_encrypted,
    KDF_NAME,
    KEY_LEN,
)


class VaultLockedError(Exception):
    """Raised when sensitive data access is attempted while the vault is locked."""


class StorageEngine:
    def __init__(self, workspace_dir: str | None = None):
        workspace_dir = workspace_dir or os.getenv("LITEFETCH_WORKSPACE", "./workspace")
        self.base_dir = Path(workspace_dir)
        self.collections_dir = self.base_dir / "collections"
        self.collections_dir.mkdir(parents=True, exist_ok=True)
        self.master_key: bytes | None = None
        self.vault_initialized = self._vault_path().exists()
        self._ensure_workspace_gitignore()
        self._ensure_default_collection()

    def _ensure_workspace_gitignore(self):
        """
        Ensure dynamic runtime artifacts are ignored when users version their workspace.
        """
        patterns = [
            "collections/*/history.json",
            "collections/*/last_results.json",
            "collections/*/cookies.json",
        ]
        gitignore_path = self.base_dir / ".gitignore"
        try:
            existing = gitignore_path.read_text().splitlines() if gitignore_path.exists() else []
            updated = existing[:]
            for p in patterns:
                if p not in existing:
                    updated.append(p)
            if updated != existing:
                gitignore_path.parent.mkdir(parents=True, exist_ok=True)
                gitignore_path.write_text("\n".join(updated) + ("\n" if updated else ""))
        except Exception:
            # Gitignore best-effort; ignore failures to avoid blocking runtime
            pass

    def refresh_workspace_gitignore(self) -> bool:
        self._ensure_workspace_gitignore()
        return True

    def _ensure_workspace_gitignore(self):
        """
        Ensure dynamic runtime artifacts are ignored when users version their workspace.
        """
        patterns = [
            "collections/*/history.json",
            "collections/*/last_results.json",
            "collections/*/cookies.json",
        ]
        gitignore_path = self.base_dir / ".gitignore"
        try:
            existing = gitignore_path.read_text().splitlines() if gitignore_path.exists() else []
            updated = existing[:]
            for p in patterns:
                if p not in existing:
                    updated.append(p)
            if updated != existing:
                gitignore_path.parent.mkdir(parents=True, exist_ok=True)
                gitignore_path.write_text("\n".join(updated) + ("\n" if updated else ""))
        except Exception:
            # Gitignore best-effort; ignore failures to avoid blocking runtime
            pass

    # --- Vault helpers ---
    def _vault_path(self) -> Path:
        return self.base_dir / ".litefetch" / "vault.key"

    def _ensure_vault_dir(self):
        (self.base_dir / ".litefetch").mkdir(parents=True, exist_ok=True)

    def _write_vault(self, master: bytes, passphrase: str):
        salt = secrets.token_bytes(16)
        key = _derive_key(passphrase, salt)
        iv = secrets.token_bytes(12)
        aes = AESGCM(key)
        ct = aes.encrypt(iv, master, None)
        payload = base64.b64encode(salt + iv + ct).decode()
        self._atomic_write(self._vault_path(), {"v": 1, "data": payload})
        self.vault_initialized = True

    def _load_vault(self, passphrase: str) -> bytes:
        data = json.loads(self._vault_path().read_text())
        blob = base64.b64decode(data["data"])
        salt, iv, ct = blob[:16], blob[16:28], blob[28:]
        key = _derive_key(passphrase, salt)
        aes = AESGCM(key)
        return aes.decrypt(iv, ct, None)

    def set_encryption_passphrase(self, passphrase: str | None):
        """
        Lock clears master from memory. Providing a passphrase unlocks existing vault
        or initializes a new one with a fresh master key.
        """
        if passphrase is None:
            self.master_key = None
            return

        self._ensure_vault_dir()
        if self._vault_path().exists():
            try:
                master = self._load_vault(passphrase)
            except Exception:
                raise
            self.master_key = master
            self.vault_initialized = True
            return

        master = secrets.token_bytes(KEY_LEN)
        self._write_vault(master, passphrase)
        self.master_key = master

    # --- Meta helpers ---
    def _now(self) -> float:
        return time.time()

    def _collection_dir(self, collection_id: str) -> Path:
        return self.collections_dir / collection_id

    def _meta_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "meta.json"

    def _collection_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "collection.json"

    def _env_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "environment.json"

    def _ui_state_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "ui_state.json"

    def _last_results_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "last_results.json"

    def _history_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "history.json"

    def _cookies_path(self, collection_id: str) -> Path:
        return self._collection_dir(collection_id) / "cookies.json"

    def _atomic_write(self, target_path: Path, data: Any):
        target_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = target_path.with_suffix(".tmp")
        if hasattr(data, "model_dump"):
            payload = json.dumps(data.model_dump(), indent=2)
        elif hasattr(data, "dict"):
            payload = json.dumps(data.dict(), indent=2)
        else:
            payload = json.dumps(data, indent=2)
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target_path)

    # --- Secure serializer ---
    def _prepare_payload(self, data: Any) -> str:
        if hasattr(data, "model_dump"):
            obj = data.model_dump()
        elif hasattr(data, "dict"):
            obj = data.dict()
        else:
            obj = data
        return json.dumps(obj, separators=(",", ":"))

    def _secure_write_json(self, target_path: Path, data: Any):
        if not self.master_key:
            raise VaultLockedError("workspace locked")
        ciphertext = encrypt_value(self._prepare_payload(data), self.master_key)
        wrapper = {"v": 1, "ciphertext": ciphertext}
        self._atomic_write(target_path, wrapper)

    def _secure_read_json(self, target_path: Path) -> Any:
        if not self.master_key:
            raise VaultLockedError("workspace locked")
        with open(target_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, dict) and "ciphertext" in raw:
            plaintext = decrypt_value(raw["ciphertext"], self.master_key)
            return json.loads(plaintext)
        return raw

    def _maybe_decrypt_wrapper(self, data: Any) -> Any:
        """
        Compatibility: unwrap legacy ciphertext blobs for collections/env files.
        """
        if isinstance(data, dict) and "ciphertext" in data:
            if not self.master_key:
                raise VaultLockedError("workspace locked")
            plaintext = decrypt_value(data["ciphertext"], self.master_key)
            return json.loads(plaintext), True
        return data, False

    def _vault_ready(self) -> bool:
        return self.vault_initialized or self._vault_path().exists()

    def has_vault(self) -> bool:
        return self._vault_path().exists()

    def is_locked(self) -> bool:
        return self.has_vault() and self.master_key is None

    def _read_sensitive(self, path: Path, default: Any = None) -> Any:
        if self.master_key:
            if not path.exists():
                return default
            return self._secure_read_json(path)
        if self._vault_ready():
            raise VaultLockedError("workspace locked")
        if not path.exists():
            return default
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_sensitive(self, path: Path, data: Any):
        if self.master_key:
            self._secure_write_json(path, data)
            return
        if self._vault_ready():
            raise VaultLockedError("workspace locked")
        self._atomic_write(path, data)

    def _require_unlocked(self):
        if self._vault_ready() and not self.master_key:
            raise VaultLockedError("workspace locked")

    def _encrypt_request_secrets(self, req: Any) -> Any:
        if not self.master_key:
            return req
        r = req.model_copy(deep=True)
        # Headers
        secret_headers = getattr(r, "secret_headers", {}) or {}
        next_headers = {}
        for k, v in (r.headers or {}).items():
            if secret_headers.get(k) and isinstance(v, str) and not v.startswith("enc:"):
                next_headers[k] = encrypt_value(v, self.master_key)
            else:
                next_headers[k] = v
        r.headers = next_headers

        # Query params
        secret_q = getattr(r, "secret_query_params", {}) or {}
        next_q = []
        for row in r.query_params or []:
            row_copy = dict(row)
            key = row_copy.get("key") or ""
            val = row_copy.get("value")
            if secret_q.get(key) and isinstance(val, str) and not str(val).startswith("enc:"):
                row_copy["value"] = encrypt_value(str(val), self.master_key)
            next_q.append(row_copy)
        r.query_params = next_q

        # Form body
        secret_form = getattr(r, "secret_form_fields", {}) or {}
        next_form = []
        for row in r.form_body or []:
            row_copy = dict(row)
            key = row_copy.get("key") or ""
            val = row_copy.get("value")
            row_type = (row_copy.get("type") or "text").lower()
            # Only encrypt textual form values; do not encrypt file paths or blobs
            if row_type == "text" and secret_form.get(key) and isinstance(val, str) and not str(val).startswith("enc:"):
                row_copy["value"] = encrypt_value(str(val), self.master_key)
            next_form.append(row_copy)
        r.form_body = next_form

        # Auth
        secret_auth = getattr(r, "secret_auth_params", {}) or {}
        next_auth = {}
        for k, v in (r.auth_params or {}).items():
            if secret_auth.get(k) and isinstance(v, str) and not v.startswith("enc:"):
                next_auth[k] = encrypt_value(v, self.master_key)
            else:
                next_auth[k] = v
        r.auth_params = next_auth

        # Body
        if getattr(r, "secret_body", False):
            body_val = r.body
            if isinstance(body_val, str) and not body_val.startswith("enc:"):
                r.body = encrypt_value(body_val, self.master_key)
            elif isinstance(body_val, dict):
                try:
                    raw = jsonlib.dumps(body_val)
                    r.body = encrypt_value(raw, self.master_key)
                except Exception:
                    pass
        return r

    def _decrypt_request_secrets(self, req: Any) -> Any:
        if not self.master_key:
            return req
        r = req
        # Headers
        secret_headers = getattr(r, "secret_headers", {}) or {}
        next_headers = {}
        for k, v in (r.headers or {}).items():
            if secret_headers.get(k) and isinstance(v, str) and v.startswith("enc:"):
                try:
                    next_headers[k] = decrypt_value(v, self.master_key)
                except CryptoError:
                    next_headers[k] = v
            else:
                next_headers[k] = v
        r.headers = next_headers

        # Query params
        secret_q = getattr(r, "secret_query_params", {}) or {}
        next_q = []
        for row in r.query_params or []:
            row_copy = dict(row)
            key = row_copy.get("key") or ""
            val = row_copy.get("value")
            if secret_q.get(key) and isinstance(val, str) and val.startswith("enc:"):
                try:
                    row_copy["value"] = decrypt_value(val, self.master_key)
                except CryptoError:
                    pass
            next_q.append(row_copy)
        r.query_params = next_q

        # Form body
        secret_form = getattr(r, "secret_form_fields", {}) or {}
        next_form = []
        for row in r.form_body or []:
            row_copy = dict(row)
            key = row_copy.get("key") or ""
            val = row_copy.get("value")
            row_type = (row_copy.get("type") or "text").lower()
            if row_type == "text" and secret_form.get(key) and isinstance(val, str) and val.startswith("enc:"):
                try:
                    row_copy["value"] = decrypt_value(val, self.master_key)
                except CryptoError:
                    pass
            next_form.append(row_copy)
        r.form_body = next_form

        # Auth
        secret_auth = getattr(r, "secret_auth_params", {}) or {}
        next_auth = {}
        for k, v in (r.auth_params or {}).items():
            if secret_auth.get(k) and isinstance(v, str) and v.startswith("enc:"):
                try:
                    next_auth[k] = decrypt_value(v, self.master_key)
                except CryptoError:
                    next_auth[k] = v
            else:
                next_auth[k] = v
        r.auth_params = next_auth

        # Body
        if getattr(r, "secret_body", False) and isinstance(r.body, str) and r.body.startswith("enc:"):
            try:
                raw = decrypt_value(r.body, self.master_key)
                try:
                    r.body = jsonlib.loads(raw)
                except Exception:
                    r.body = raw
            except CryptoError:
                pass
        return r

    def _walk_requests(self, items: list, fn) -> list:
        result = []
        for item in items:
            if isinstance(item, dict) and "items" in item:
                folder = dict(item)
                folder["items"] = self._walk_requests(folder.get("items", []), fn)
                result.append(folder)
            elif hasattr(item, "items"):
                folder = item.model_copy(deep=True)
                folder.items = self._walk_requests(folder.items or [], fn)
                result.append(folder)
            else:
                req_obj = item if hasattr(item, "id") else item
                transformed = fn(req_obj)
                result.append(transformed)
        return result

    def reencrypt_sensitive(self) -> Dict[str, int]:
        """
        Rewrites all sensitive assets with the current master key. If the vault is locked,
        callers must unlock first.
        """
        if not self.master_key:
            raise VaultLockedError("workspace locked")
        stats = {"collections": 0, "environments": 0, "history": 0, "last_results": 0, "cookies": 0, "gitignore": 1}
        self._ensure_workspace_gitignore()
        for cdir in self.collections_dir.iterdir():
            if not cdir.is_dir():
                continue
            cid = cdir.name
            collection_path = self._collection_path(cid)
            env_path = self._env_path(cid)
            history_path = self._history_path(cid)
            last_results_path = self._last_results_path(cid)
            cookies_path = self._cookies_path(cid)

            if collection_path.exists():
                try:
                    col = self.load_collection(cid)
                    self.save_collection(cid, col)
                    stats["collections"] += 1
                except Exception:
                    pass
            if env_path.exists():
                try:
                    env = self.load_environment(cid)
                    self.save_environment(cid, env)
                    stats["environments"] += 1
                except Exception:
                    pass
            if history_path.exists():
                try:
                    hist = self.load_history(cid)
                    self._write_sensitive(history_path, hist)
                    stats["history"] += 1
                except Exception:
                    pass
            if last_results_path.exists():
                try:
                    lr = self.load_last_results(cid)
                    self._write_sensitive(last_results_path, lr)
                    stats["last_results"] += 1
                except Exception:
                    pass
            if cookies_path.exists():
                try:
                    cookies = self._load_cookies_blob(cid)
                    self._write_sensitive(cookies_path, cookies)
                    stats["cookies"] += 1
                except Exception:
                    pass
        return stats

    # --- Default bootstrap ---
    def _ensure_default_collection(self):
        dirs = [p for p in self.collections_dir.iterdir() if p.is_dir()]
        if dirs:
            return
        default_id = "default"
        try:
            self.create_collection(name="Default", collection_id=default_id)
        except VaultLockedError:
            # Locked workspace with no collections; skip bootstrap until unlocked
            return

    # --- CRUD ---
    def list_collections(self) -> List[CollectionMeta]:
        metas: List[CollectionMeta] = []
        for p in self.collections_dir.iterdir():
            if not p.is_dir():
                continue
            meta_path = p / "meta.json"
            if not meta_path.exists():
                continue
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                metas.append(CollectionMeta(**data))
        # sort by created_at
        metas.sort(key=lambda m: m.created_at)
        return metas

    def create_collection(
        self,
        name: str,
        collection_id: Optional[str] = None,
        collection: Optional[Collection] = None,
        environment: Optional[EnvironmentFile] = None,
        ui_state: Optional[Dict[str, Any]] = None,
        last_results: Optional[Dict[str, Any]] = None,
        history: Optional[List[RequestResult]] = None,
    ) -> CollectionMeta:
        cid = collection_id or uuid4().hex
        cdir = self._collection_dir(cid)
        cdir.mkdir(parents=True, exist_ok=True)
        now = self._now()
        meta = CollectionMeta(id=cid, name=name, created_at=now, updated_at=now)

        self._atomic_write(self._meta_path(cid), meta)
        self.save_collection(cid, collection or Collection(id=cid, name=name))
        self.save_environment(cid, environment or EnvironmentFile())
        self._atomic_write(self._ui_state_path(cid), ui_state or {"openFolders": []})
        self._write_sensitive(self._last_results_path(cid), last_results or {})
        self._write_sensitive(self._history_path(cid), history or [])
        self._write_sensitive(self._cookies_path(cid), {})
        return meta

    def _touch_meta(self, collection_id: str, name: Optional[str] = None):
        meta = self.load_meta(collection_id)
        if name:
            meta.name = name
        meta.updated_at = self._now()
        self._atomic_write(self._meta_path(collection_id), meta)

    def load_meta(self, collection_id: str) -> CollectionMeta:
        with open(self._meta_path(collection_id), "r", encoding="utf-8") as f:
            return CollectionMeta(**json.load(f))

    def load_collection(self, collection_id: str) -> Collection:
        if self._vault_ready() and not self.master_key:
            raise VaultLockedError("workspace locked")
        with open(self._collection_path(collection_id), "r", encoding="utf-8") as f:
            raw = json.load(f)
        data, was_wrapped = self._maybe_decrypt_wrapper(raw)
        col = Collection(**data)
        if self.master_key:
            col.items = self._walk_requests(col.items or [], self._decrypt_request_secrets)
        # If we unwrapped a legacy encrypted blob, rewrite in new format
        if was_wrapped:
            try:
                self.save_collection(collection_id, col)
            except Exception:
                pass
        return col

    def save_collection(self, collection_id: str, collection: Collection):
        # Protect against plaintext writes when vault exists but locked
        if self._vault_ready() and not self.master_key:
            raise VaultLockedError("workspace locked")
        col_copy = collection.model_copy(deep=True)
        if self.master_key:
            col_copy.items = self._walk_requests(col_copy.items or [], self._encrypt_request_secrets)
        self._atomic_write(self._collection_path(collection_id), col_copy)
        self._touch_meta(collection_id, name=collection.name)

    def load_environment(self, collection_id: str) -> EnvironmentFile:
        if self._vault_ready() and not self.master_key:
            raise VaultLockedError("workspace locked")
        with open(self._env_path(collection_id), "r", encoding="utf-8") as f:
            raw = json.load(f)
        data, was_wrapped = self._maybe_decrypt_wrapper(raw)
        env_file = EnvironmentFile(**data)
        if not self.master_key:
            return env_file

        for env_obj in env_file.envs.values():
            secrets_map = getattr(env_obj, "secrets", {}) or {}
            for key, is_secret in secrets_map.items():
                if not is_secret:
                    continue
                val = env_obj.variables.get(key)
                if isinstance(val, str) and val.startswith("enc:"):
                    try:
                        env_obj.variables[key] = decrypt_value(val, self.master_key)
                    except CryptoError:
                        continue
        if was_wrapped:
            try:
                self.save_environment(collection_id, env_file)
            except Exception:
                pass
        return env_file

    def save_environment(self, collection_id: str, env: EnvironmentFile):
        if self._vault_ready() and not self.master_key:
            raise VaultLockedError("workspace locked")
        env_copy = env.model_copy(deep=True)
        if self.master_key:
            for env_obj in env_copy.envs.values():
                secrets_map = getattr(env_obj, "secrets", {}) or {}
                for key, is_secret in secrets_map.items():
                    if not is_secret:
                        continue
                    val = env_obj.variables.get(key)
                    if isinstance(val, str) and val.startswith("enc:"):
                        # already encrypted, leave as-is
                        continue
                    if isinstance(val, str):
                        env_obj.variables[key] = encrypt_value(val, self.master_key)
        self._atomic_write(self._env_path(collection_id), env_copy)
        self._touch_meta(collection_id)

    def load_ui_state(self, collection_id: str) -> dict:
        with open(self._ui_state_path(collection_id), "r", encoding="utf-8") as f:
            return json.load(f)

    def save_ui_state(self, collection_id: str, ui_state: dict):
        open_folders = ui_state.get("openFolders", [])
        if not isinstance(open_folders, list):
            open_folders = []
        self._atomic_write(self._ui_state_path(collection_id), {"openFolders": open_folders})
        self._touch_meta(collection_id)

    def load_last_results(self, collection_id: str) -> dict:
        return self._read_sensitive(self._last_results_path(collection_id), default={})

    def save_last_results(self, collection_id: str, results: dict):
        if not isinstance(results, dict):
            results = {}
        self._write_sensitive(self._last_results_path(collection_id), results)
        self._touch_meta(collection_id)

    def load_history(self, collection_id: str) -> List[dict]:
        return self._read_sensitive(self._history_path(collection_id), default=[])

    def append_history(self, collection_id: str, result: dict):
        history = self.load_history(collection_id) or []
        history.insert(0, result)
        history = history[:50]
        self._write_sensitive(self._history_path(collection_id), history)
        self._touch_meta(collection_id)

    # --- Cookies ---
    def _load_cookies_blob(self, collection_id: str) -> Dict[str, list]:
        data = self._read_sensitive(self._cookies_path(collection_id), default={})
        return data if isinstance(data, dict) else {}

    def _prune_expired(self, cookies: list) -> list:
        now = time.time()
        cleaned = []
        for c in cookies:
            try:
                exp = c.get("expires")
                if exp is not None and exp < now:
                    continue
                cleaned.append(c)
            except Exception:
                continue
        return cleaned

    def load_env_cookies(self, collection_id: str, env_id: str) -> list:
        data = self._load_cookies_blob(collection_id)
        entries = data.get(env_id, []) if isinstance(data, dict) else []
        if not isinstance(entries, list):
            entries = []
        cleaned = self._prune_expired(entries)
        if cleaned != entries:
            data[env_id] = cleaned
            self._write_sensitive(self._cookies_path(collection_id), data)
            self._touch_meta(collection_id)
        return cleaned

    def save_env_cookies(self, collection_id: str, env_id: str, cookies: list):
        data = self._load_cookies_blob(collection_id)
        data[env_id] = cookies if isinstance(cookies, list) else []
        self._write_sensitive(self._cookies_path(collection_id), data)
        self._touch_meta(collection_id)

    def clear_env_cookies(self, collection_id: str, env_id: str):
        data = self._load_cookies_blob(collection_id)
        if env_id in data:
            data[env_id] = []
            self._write_sensitive(self._cookies_path(collection_id), data)
            self._touch_meta(collection_id)

    def load_bundle(self, collection_id: str) -> CollectionBundle:
        meta = self.load_meta(collection_id)
        collection = self.load_collection(collection_id)
        env = self.load_environment(collection_id)
        ui_state = self.load_ui_state(collection_id)
        last_results = self.load_last_results(collection_id)
        history = self.load_history(collection_id)
        return CollectionBundle(
            meta=meta,
            collection=collection,
            environment=env,
            ui_state=ui_state,
            last_results=last_results,
            history=[RequestResult(**h) if isinstance(h, dict) else h for h in history],
        )

    def delete_collection(self, collection_id: str):
        cdir = self._collection_dir(collection_id)
        if cdir.exists():
            shutil.rmtree(cdir)

    # --- Workspace crypto helpers ---
    def has_legacy_inline_encryption(self) -> bool:
        for env_path in self.collections_dir.rglob("environment.json"):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            envs = data.get("envs", {})
            for env_obj in envs.values():
                secrets_map = (env_obj or {}).get("secrets", {}) or {}
                for key, is_secret in secrets_map.items():
                    if not is_secret:
                        continue
                    val = (env_obj or {}).get("variables", {}).get(key)
                    if isinstance(val, str) and val.startswith("enc:"):
                        try:
                            _, kdf_name, _, _, _, _ = _parse_encrypted(val)
                        except CryptoError:
                            continue
                        if kdf_name == KDF_NAME:
                            return True
        return False

    def migrate_legacy_environments(self, passphrase: str, master: bytes) -> Dict[str, int]:
        stats = {"updated": 0, "collections": 0}
        for env_path in self.collections_dir.rglob("environment.json"):
            changed = False
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            envs = data.get("envs", {})
            for env_key, env_obj in envs.items():
                secrets_map = (env_obj or {}).get("secrets", {}) or {}
                for key, is_secret in secrets_map.items():
                    if not is_secret:
                        continue
                    val = (env_obj or {}).get("variables", {}).get(key)
                    if isinstance(val, str) and val.startswith("enc:"):
                        try:
                            _, kdf_name, _, _, _, _ = _parse_encrypted(val)
                        except CryptoError:
                            continue
                        if kdf_name != KDF_NAME:
                            continue
                        try:
                            plaintext = decrypt_value(val, passphrase)
                            env_obj["variables"][key] = encrypt_value(plaintext, master)
                            changed = True
                        except CryptoError:
                            continue
                envs[env_key] = env_obj
            if changed:
                stats["collections"] += 1
                self._atomic_write(env_path, data)
                stats["updated"] += 1
        return stats

    def unlock_workspace(self, passphrase: str) -> Tuple[bool, Dict[str, int]]:
        """
        Unlock workspace master key (or initialize vault) and migrate any legacy
        ciphertext encrypted directly with the passphrase.
        """
        try:
            self.set_encryption_passphrase(passphrase)
        except Exception:
            return False, {"updated": 0, "collections": 0}
        if not self.master_key:
            return False, {"updated": 0, "collections": 0}
        stats = self.migrate_legacy_environments(passphrase, self.master_key)
        return True, stats


storage = StorageEngine()

def swap_storage(workspace_dir: str):
    """
    Replace the global storage instance with one pointing to a new workspace dir.
    """
    global storage
    storage = StorageEngine(workspace_dir=workspace_dir)
    return storage
