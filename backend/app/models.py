from __future__ import annotations
from typing import List, Optional, Dict, Any, Union, Literal
from pydantic import BaseModel, Field
import time
import uuid

# --- Core Request Models ... ---

class ExtractionRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_path: str  # JMESPath, e.g. "body.data.token"
    target_variable: str  # e.g. "access_token"

class HttpRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "New Request"
    method: Literal["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] = "GET"
    url: str = ""
    headers: Dict[str, str] = {}
    body: Optional[Union[str, Dict[str, Any]]] = None # raw string or JSON
    body_mode: str = "raw" # raw, json, form-urlencoded, form-data, binary
    # form_body rows support explicit type/text/file/binary metadata
    # {key, type: 'text' | 'file' | 'binary', value?, file_path?, file_inline?, file_name?, enabled?, secret?}
    form_body: Optional[List[Dict[str, Any]]] = None
    # binary payload metadata for body_mode == "binary"
    binary: Optional[Dict[str, Any]] = None  # {file_path?, file_inline?, file_name?}
    auth_type: Literal["none", "basic", "bearer"] = "none"
    auth_params: Dict[str, str] = {}
    query_params: Optional[List[Dict[str, Any]]] = None  # [{key, value, enabled}]
    extract_rules: List[ExtractionRule] = []
    # Secret markers for UI/serialization awareness
    secret_headers: Dict[str, bool] = {}
    secret_query_params: Dict[str, bool] = {}
    secret_form_fields: Dict[str, bool] = {}
    secret_auth_params: Dict[str, bool] = {}
    secret_body: bool = False
    
    # Settings
    timeout_seconds: int = 30
    verify_ssl: bool = False

class CollectionFolder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "New Folder"
    items: List[Union['CollectionFolder', HttpRequest]] = [] # Recursive structure

# Resolve forward reference for recursion
CollectionFolder.model_rebuild()

class Collection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "My Collection"
    items: List[Union[CollectionFolder, HttpRequest]] = []

class CollectionMeta(BaseModel):
    id: str
    name: str
    created_at: float
    updated_at: float

# --- Environment Models ---

class Environment(BaseModel):
    name: str
    variables: Dict[str, Any] = {}
    secrets: Dict[str, bool] = {}

class EnvironmentFile(BaseModel):
    active_env: str = "default"
    envs: Dict[str, Environment] = {
        "default": Environment(name="default")
    }

# --- Response Models ---

class RequestResult(BaseModel):
    request_id: str
    status_code: int
    duration_ms: float
    headers: Dict[str, str]
    body: Any
    body_is_json: bool = False
    content_type: Optional[str] = None
    body_bytes: int = 0
    error: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)

# --- Cookie Models ---

class StoredCookie(BaseModel):
    name: str
    value: str
    domain: str
    path: str = "/"
    expires: Optional[float] = None
    secure: bool = False
    http_only: bool = False

# --- Bundle Model (per-collection aggregate) ---

class CollectionBundle(BaseModel):
    meta: CollectionMeta
    collection: Collection
    environment: EnvironmentFile
    ui_state: Dict[str, Any]
    last_results: Dict[str, Any]
    history: List[RequestResult] = []

CollectionFolder.model_rebuild()
CollectionBundle.model_rebuild()
