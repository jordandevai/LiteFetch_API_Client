from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Body
from app.models import (
    Collection,
    EnvironmentFile,
    HttpRequest,
    RequestResult,
    CollectionBundle,
    CollectionMeta,
    StoredCookie,
)
from app.core.storage import storage, swap_storage, VaultLockedError
from app.core.engine import runner
import os
import subprocess

router = APIRouter()


# --- Collections Index ---
@router.get("/collections", response_model=List[CollectionMeta])
async def list_collections():
    return storage.list_collections()


@router.post("/collections", response_model=CollectionMeta)
async def create_collection(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name") or "New Collection"
    collection_data = payload.get("collection")
    env_data = payload.get("environment")
    ui_state = payload.get("ui_state")
    last_results = payload.get("last_results")
    history = payload.get("history")

    collection = Collection(**collection_data) if collection_data else None
    environment = EnvironmentFile(**env_data) if env_data else None
    try:
        meta = storage.create_collection(
            name=name,
            collection=collection,
            environment=environment,
            ui_state=ui_state,
            last_results=last_results,
            history=history,
        )
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    return meta


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str):
    storage.delete_collection(collection_id)
    return {"status": "ok"}


# --- Collection Bundle ---
@router.get("/collections/{collection_id}", response_model=CollectionBundle)
async def get_collection_bundle(collection_id: str):
    try:
        return storage.load_bundle(collection_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


# --- Collection CRUD ---
@router.get("/collections/{collection_id}/collection", response_model=Collection)
async def get_collection(collection_id: str):
    try:
        return storage.load_collection(collection_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


@router.post("/collections/{collection_id}/collection")
async def save_collection(collection_id: str, col: Collection):
    try:
        storage.save_collection(collection_id, col)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    return {"status": "ok"}


# --- Environments ---
@router.get("/collections/{collection_id}/environment", response_model=EnvironmentFile)
async def get_envs(collection_id: str):
    try:
        return storage.load_environment(collection_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


@router.post("/collections/{collection_id}/environment")
async def save_envs(collection_id: str, env: EnvironmentFile):
    try:
        storage.save_environment(collection_id, env)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    return {"status": "ok"}


# --- Execution ---
@router.post("/collections/{collection_id}/run", response_model=RequestResult)
async def run_request(collection_id: str, req: HttpRequest):
    try:
        return await runner.execute(collection_id, req)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


# --- History ---
@router.get("/collections/{collection_id}/history")
async def get_history(collection_id: str):
    try:
        return storage.load_history(collection_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


# --- UI State ---
@router.get("/collections/{collection_id}/ui-state")
async def get_ui_state(collection_id: str) -> Dict[str, Any]:
    return storage.load_ui_state(collection_id)


@router.post("/collections/{collection_id}/ui-state")
async def save_ui_state(collection_id: str, ui_state: Dict[str, Any]):
    storage.save_ui_state(collection_id, ui_state)
    return {"status": "ok"}


# --- Last Results ---
@router.get("/collections/{collection_id}/last-results")
async def get_last_results(collection_id: str) -> Dict[str, Any]:
    try:
        return storage.load_last_results(collection_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


@router.post("/collections/{collection_id}/last-results")
async def save_last_results(collection_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        storage.save_last_results(collection_id, payload)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    return {"status": "ok"}


@router.post("/collections/{collection_id}/last-results/{request_id}")
async def upsert_last_result(collection_id: str, request_id: str, result: RequestResult):
    try:
        storage.upsert_last_result(collection_id, request_id, result.model_dump())
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    return {"status": "ok"}


# --- Workspace ---
@router.get("/workspace")
async def get_workspace():
    return {"path": str(storage.base_dir.resolve())}


@router.post("/workspace")
async def set_workspace(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    try:
        abs_path = os.path.abspath(os.path.expanduser(path))
        os.makedirs(abs_path, exist_ok=True)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Cannot use workspace path: {ex}")
    swap_storage(abs_path)
    return {"path": abs_path}


@router.post("/workspace/passphrase")
async def set_passphrase(payload: Dict[str, Any] = Body(...)):
    """
    Legacy-compatible setter; retains API shape for existing clients.
    """
    if payload is None:
        storage.set_encryption_passphrase(None)
        return {"status": "cleared"}
    if "passphrase" not in payload:
        raise HTTPException(status_code=400, detail="passphrase required")
    passphrase = payload.get("passphrase")
    if passphrase is None or passphrase == "":
        storage.set_encryption_passphrase(None)
        return {"status": "cleared"}
    ok, _ = storage.unlock_workspace(str(passphrase))
    if not ok:
        raise HTTPException(status_code=401, detail="incorrect passphrase")
    return {"status": "ok"}


@router.post("/workspace/git/init")
async def init_workspace_git():
    workspace_path = str(storage.base_dir.resolve())
    try:
        # If already a repo, no-op
        if os.path.isdir(os.path.join(workspace_path, ".git")):
            return {"status": "already-initialized"}
        result = subprocess.run(
            ["git", "init"],
            cwd=workspace_path,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr or "git init failed")
        return {"status": "initialized", "output": result.stdout.strip()}
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="git not available on server")


@router.get("/workspace/status")
async def get_workspace_status():
    vault_path = storage.base_dir / ".litefetch" / "vault.key"
    ciphertext = storage.has_encrypted_payloads_without_key()
    locked = (vault_path.exists() and storage.master_key is None) or ciphertext
    legacy = storage.has_legacy_inline_encryption()
    return {"locked": locked, "legacy": legacy, "has_vault": vault_path.exists(), "ciphertext": ciphertext}


@router.post("/workspace/unlock")
async def unlock_workspace(payload: Dict[str, Any] = Body(...)):
    passphrase = payload.get("passphrase") if payload else None
    if not passphrase:
        raise HTTPException(status_code=400, detail="passphrase required")
    ok, migrated = storage.unlock_workspace(str(passphrase))
    if not ok:
        raise HTTPException(status_code=401, detail="incorrect passphrase")
    return {"status": "unlocked", "migrated": migrated}


@router.post("/workspace/lock")
async def lock_workspace():
    storage.set_encryption_passphrase(None)
    return {"status": "locked"}


@router.post("/workspace/rotate")
async def rotate_workspace(payload: Dict[str, Any] = Body(...)):
    old = (payload or {}).get("old")
    new = (payload or {}).get("new")
    if not old or not new:
        raise HTTPException(status_code=400, detail="old and new passphrases required")
    ok, _ = storage.unlock_workspace(str(old))
    if not ok:
        raise HTTPException(status_code=401, detail="incorrect passphrase")
    if not storage.master_key:
        raise HTTPException(status_code=500, detail="master key unavailable")
    storage._write_vault(storage.master_key, str(new))
    return {"status": "rotated"}


@router.post("/workspace/migrate")
async def migrate_workspace():
    try:
        # Always refresh gitignore; allow non-vault workspaces to update safely
        storage.refresh_workspace_gitignore()
        if storage.master_key:
            stats = storage.reencrypt_sensitive()
            return {"status": "migrated", "stats": stats}
        if storage.is_locked():
            raise HTTPException(status_code=423, detail="workspace locked")
        # No vault yet; gitignore updated, nothing to re-encrypt
        return {"status": "updated", "stats": {"gitignore": 1}}
    except Exception:
        raise HTTPException(status_code=500, detail="migration failed")


@router.post("/workspace/gitignore")
async def ensure_gitignore():
    """
    Ensure gitignore patterns for runtime artifacts are present in the workspace.
    """
    try:
        storage.refresh_workspace_gitignore()
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=500, detail="gitignore update failed")


# --- Cookies ---
def _resolve_env_id(collection_id: str, env_id: str | None) -> str:
    env_file = storage.load_environment(collection_id)
    if env_id and env_id in env_file.envs:
        return env_id
    return env_file.active_env


@router.get("/collections/{collection_id}/cookies", response_model=List[StoredCookie])
async def list_cookies(collection_id: str, env: str | None = None):
    try:
        env_id = _resolve_env_id(collection_id, env)
        return storage.load_env_cookies(collection_id, env_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


@router.post("/collections/{collection_id}/cookies", response_model=List[StoredCookie])
async def upsert_cookie(collection_id: str, cookie: StoredCookie, env: str | None = None):
    try:
        env_id = _resolve_env_id(collection_id, env)
        cookies = storage.load_env_cookies(collection_id, env_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    next_cookies = []
    replaced = False
    for c in cookies:
        if (
            isinstance(c, dict)
            and c.get("name") == cookie.name
            and c.get("domain") == cookie.domain
            and c.get("path", "/") == cookie.path
        ):
            next_cookies.append(cookie.model_dump())
            replaced = True
        else:
            next_cookies.append(c)
    if not replaced:
        next_cookies.append(cookie.model_dump())
    try:
        storage.save_env_cookies(collection_id, env_id, next_cookies)
        return storage.load_env_cookies(collection_id, env_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")


@router.delete("/collections/{collection_id}/cookies", response_model=List[StoredCookie])
async def delete_cookies(
    collection_id: str,
    env: str | None = None,
    domain: str | None = None,
    path: str | None = None,
    name: str | None = None,
):
    try:
        env_id = _resolve_env_id(collection_id, env)
        if not domain and not path and not name:
            storage.clear_env_cookies(collection_id, env_id)
            return []
        cookies = storage.load_env_cookies(collection_id, env_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
    next_cookies = []
    for c in cookies:
        if not isinstance(c, dict):
            continue
        matches = True
        if domain and c.get("domain") != domain:
            matches = False
        if path and c.get("path", "/") != path:
            matches = False
        if name and c.get("name") != name:
            matches = False
        if matches:
            continue
        next_cookies.append(c)
    try:
        storage.save_env_cookies(collection_id, env_id, next_cookies)
        return storage.load_env_cookies(collection_id, env_id)
    except VaultLockedError:
        raise HTTPException(status_code=423, detail="workspace locked")
