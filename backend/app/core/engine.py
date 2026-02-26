import httpx
import re
import jmespath
import time
import uuid
import random
import json
from typing import Any, Dict, Tuple
from app.models import HttpRequest, RequestResult, EnvironmentFile
from app.core.storage import storage
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl
import base64

class RequestRunner:
    def __init__(self):
        self.var_pattern = re.compile(r"\{\{([^}]+)\}\}")
        self._path_prefixes = ("body.", "response.", "$.")

    def _normalize_path(self, path: str) -> str:
        """
        Allow user-friendly prefixes like body.id / response.id / $.id.
        JMESPath expects paths relative to the document root, so we strip
        common prefixes rather than failing silently.
        """
        for prefix in self._path_prefixes:
            if path.startswith(prefix):
                return path[len(prefix):]
        return path

    def _resolve_dynamic_vars(self, value: str) -> str:
        """Handles {{$uuid}}, {{$timestamp}}, etc."""
        if "{{$uuid}}" in value:
            value = value.replace("{{$uuid}}", str(uuid.uuid4()))
        if "{{$timestamp}}" in value:
            value = value.replace("{{$timestamp}}", str(int(time.time())))
        if "{{$randomInt}}" in value:
            value = value.replace("{{$randomInt}}", str(random.randint(1, 10000)))
        return value

    def _inject_variables(self, text: str, env_vars: Dict[str, Any]) -> str:
        """
        Replaces {{key}} with value from env_vars.
        Handles escaping \{{key}} -> {{key}}.
        """
        if not text:
            return ""
            
        # 1. Handle dynamic vars first
        text = self._resolve_dynamic_vars(text)

        # 2. Find matches
        matches = self.var_pattern.findall(text)
        for match in matches:
            # Check for escape
            # We need 4 backslashes to satisfy Python 3.12+ strictness
            escape_pattern = f"\\\\{{{{{match}}}}}"
            if escape_pattern in text:
                # Remove backslash
                text = text.replace(escape_pattern, f"{{{{{match}}}}}")
                continue
            
            # Replace
            if match in env_vars:
                val = str(env_vars[match])
                text = text.replace(f"{{{{{match}}}}}", val)
            # If not found, leave it (or we could log a warning)
            
        return text

    def _prepare_request(self, req: HttpRequest, env_vars: Dict[str, Any]) -> HttpRequest:
        # Deep copy to avoid mutating the original object in memory
        req_copy = req.model_copy(deep=True)
        
        # Inject into URL
        req_copy.url = self._inject_variables(req_copy.url, env_vars)
        
        # Inject into Headers
        new_headers = {}
        for k, v in req_copy.headers.items():
            new_headers[self._inject_variables(k, env_vars)] = self._inject_variables(v, env_vars)
        req_copy.headers = new_headers

        # Inject into Body
        if isinstance(req_copy.body, str):
            req_copy.body = self._inject_variables(req_copy.body, env_vars)
        # Inject into form fields (for urlencoded/form-data)
        if req_copy.form_body:
            next_rows = []
            for row in req_copy.form_body:
                key = self._inject_variables(str(row.get("key", "")), env_vars)
                val = row.get("value", "")
                row_type = row.get("type") or "text"
                if isinstance(val, str):
                    val = self._inject_variables(val, env_vars)
                file_path = row.get("file_path")
                if isinstance(file_path, str):
                    file_path = self._inject_variables(file_path, env_vars)
                next_row = dict(row)
                next_row["key"] = key
                next_row["value"] = val
                if file_path:
                    next_row["file_path"] = file_path
                # Keep inline blobs untouched
                next_row["type"] = row_type
                next_rows.append(next_row)
            req_copy.form_body = next_rows

        # Inject into binary payload path if present
        if req_copy.binary:
            binary_copy = dict(req_copy.binary)
            path_val = binary_copy.get("file_path")
            if isinstance(path_val, str):
                binary_copy["file_path"] = self._inject_variables(path_val, env_vars)
            req_copy.binary = binary_copy

        # Inject into query params list
        if req_copy.query_params:
            cleaned_params = []
            for row in req_copy.query_params:
                if row.get("enabled") is False:
                    continue
                key = self._inject_variables(str(row.get("key", "")).strip(), env_vars)
                if not key:
                    continue
                val = row.get("value")
                if isinstance(val, str):
                    val = self._inject_variables(val, env_vars)
                cleaned_params.append((key, "" if val is None else val))
            if cleaned_params:
                parsed = urlparse(req_copy.url)
                # When explicit query_params are provided, treat them as the source of truth
                # and replace the existing query to avoid duplicate keys/values.
                req_copy.url = urlunparse(parsed._replace(query=urlencode(cleaned_params, doseq=True)))

        # Auth injection
        auth_type = (req_copy.auth_type or "none").lower()
        if auth_type != "none":
            # Avoid double-setting if already provided
            headers = dict(req_copy.headers or {})
            if auth_type == "basic":
                username = self._inject_variables(str(req_copy.auth_params.get("username", "")), env_vars)
                password = self._inject_variables(str(req_copy.auth_params.get("password", "")), env_vars)
                if username is None:
                    username = ""
                if password is None:
                    password = ""
                import base64
                token_source = f"{username}:{password}"
                token = base64.b64encode(token_source.encode()).decode()
                headers["Authorization"] = f"Basic {token}"
            elif auth_type == "bearer":
                token = self._inject_variables(str(req_copy.auth_params.get("token", "")), env_vars)
                headers["Authorization"] = f"Bearer {token}"
            req_copy.headers = headers

        return req_copy

    def _build_payload(self, req: HttpRequest) -> Tuple[Dict[str, Any], Any, Any, Any, list, str]:
        """
        Returns (data, files, json_body, content, file_handles, error_message)
        so caller can close file handles and handle errors.
        """
        data = None
        files = None
        json_body = None
        content = None
        file_handles = []

        body_mode = (req.body_mode or "raw").lower()

        if body_mode in ("form-urlencoded", "form-data") and req.form_body:
            data_dict = {}
            for row in req.form_body:
                if row.get("enabled") is False:
                    continue
                key = (row.get("key") or "").strip()
                if not key:
                    continue
                row_type = (row.get("type") or "text").lower()
                val = row.get("value") or ""

                if body_mode == "form-data" and row_type in ("file", "binary"):
                    file_name = row.get("file_name") or (row.get("file_path") or "").split("/")[-1] or "upload.bin"
                    file_path = row.get("file_path")
                    inline_blob = row.get("file_inline")
                    if file_path:
                        try:
                            fh = open(file_path, "rb")
                            file_handles.append(fh)
                            if files is None:
                                files = []
                            files.append((key, (file_name, fh)))
                        except Exception as ex:
                            return None, None, None, None, file_handles, f"File read error for '{key}': {ex}"
                    elif inline_blob:
                        try:
                            blob_bytes = base64.b64decode(inline_blob)
                            if files is None:
                                files = []
                            files.append((key, (file_name, blob_bytes)))
                        except Exception as ex:
                            return None, None, None, None, file_handles, f"File decode error for '{key}': {ex}"
                    else:
                        return None, None, None, None, file_handles, f"File missing for '{key}'"
                else:
                    data_dict[key] = val

            data = data_dict
            return data, files, json_body, content, file_handles, None

        if body_mode == "binary":
            bin_meta = req.binary or {}
            file_path = bin_meta.get("file_path")
            inline_blob = bin_meta.get("file_inline")
            if file_path:
                try:
                    fh = open(file_path, "rb")
                    file_handles.append(fh)
                    content = fh
                except Exception as ex:
                    return None, None, None, None, file_handles, f"File read error for binary body: {ex}"
            elif inline_blob:
                try:
                    content = base64.b64decode(inline_blob)
                except Exception as ex:
                    return None, None, None, None, file_handles, f"File decode error for binary body: {ex}"
            else:
                return None, None, None, None, file_handles, "Binary body is missing a file"
            return data, files, json_body, content, file_handles, None

        if body_mode == "json":
            if isinstance(req.body, str):
                # Attempt to parse string into JSON; fall back to raw content if parse fails
                try:
                    import json
                    json_body = json.loads(req.body)
                except Exception:
                    content = req.body
            else:
                json_body = req.body
            return data, files, json_body, content, file_handles, None

        # raw / fallback
        content = req.body if req.body else None
        return data, files, json_body, content, file_handles, None

    def _httpx_cookies_from_entries(self, entries: list) -> httpx.Cookies:
        jar = httpx.Cookies()
        if not entries:
            return jar
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            name = entry.get("name")
            if not name:
                continue
            try:
                jar.set(
                    name=name,
                    value=str(entry.get("value", "")),
                    domain=entry.get("domain"),
                    path=entry.get("path") or "/",
                    expires=entry.get("expires"),
                    secure=bool(entry.get("secure", False)),
                    httponly=bool(entry.get("http_only", False)),
                )
            except Exception:
                continue
        return jar

    def _entries_from_httpx_cookies(self, cookies: httpx.Cookies) -> list:
        results = []
        try:
            jar = cookies.jar
        except Exception:
            return results

        for c in jar:
            try:
                http_only = False
                try:
                    http_only = c.has_nonstandard_attr("HttpOnly") or bool(c._rest.get("HttpOnly"))
                except Exception:
                    http_only = False

                results.append({
                    "name": c.name,
                    "value": c.value,
                    "domain": c.domain,
                    "path": c.path or "/",
                    "expires": c.expires,
                    "secure": bool(c.secure),
                    "http_only": http_only,
                })
            except Exception:
                continue
        return results

    async def execute(self, collection_id: str, req: HttpRequest) -> RequestResult:
        # 1. Load Environment scoped to collection
        env_file = storage.load_environment(collection_id)
        active_vars = env_file.envs.get(env_file.active_env, {}).variables
        env_id = env_file.active_env

        # Load persisted cookies for this environment
        cookie_entries = storage.load_env_cookies(collection_id, env_id)
        client_cookies = self._httpx_cookies_from_entries(cookie_entries)

        # 2. Prepare
        final_req = self._prepare_request(req, active_vars)

        # 3. Execute
        start_time = time.perf_counter()
        error = None
        resp_obj = None
        file_handles = []
        
        try:
            data, files, json_body, content, file_handles, build_err = self._build_payload(final_req)
            if build_err:
                raise Exception(build_err)

            async with httpx.AsyncClient(verify=final_req.verify_ssl, cookies=client_cookies) as client:
                response = await client.request(
                    method=final_req.method,
                    url=final_req.url,
                    headers=final_req.headers,
                    data=data,
                    files=files,
                    json=json_body,
                    content=content,
                    timeout=final_req.timeout_seconds
                )
                await response.aread() # Load body into memory
                resp_obj = response
                # Persist updated cookies for this environment
                updated_entries = self._entries_from_httpx_cookies(client.cookies)
                storage.save_env_cookies(collection_id, env_id, updated_entries)
                
        except Exception as e:
            error = str(e)
            duration = (time.perf_counter() - start_time) * 1000
            return RequestResult(
                request_id=req.id,
                status_code=0,
                duration_ms=duration,
                headers={},
                body=None,
                error=error
            )
        finally:
            for fh in file_handles:
                try:
                    fh.close()
                except Exception:
                    pass

        duration = (time.perf_counter() - start_time) * 1000

        # 4. Parse Body (lazy)
        body_content = ""
        parsed_json = None
        content_type = resp_obj.headers.get("content-type")
        content_type_l = (content_type or "").lower()
        body_is_json = "application/json" in content_type_l or content_type_l.endswith("+json") or "+json;" in content_type_l
        body_bytes = len(resp_obj.content or b"")

        try:
            body_content = resp_obj.text
        except Exception:
            try:
                body_content = (resp_obj.content or b"").decode("utf-8", errors="replace")
            except Exception:
                body_content = ""

        # 5. Extraction Logic (Auto-Magic)
        vars_updated = False
        rule_errors = []
        if req.extract_rules:
            if body_is_json:
                try:
                    parsed_json = json.loads(body_content) if body_content else None
                except Exception as ex:
                    parsed_json = None
                    rule_errors.append({"rule_id": "*", "error": f"Invalid JSON response body: {ex}"})
            else:
                rule_errors.append({"rule_id": "*", "error": "Response body is not JSON"})

        if parsed_json is not None and req.extract_rules:
            for rule in req.extract_rules:
                source_path = self._normalize_path(rule.source_path.strip())
                try:
                    extracted_val = jmespath.search(source_path, parsed_json)
                    if extracted_val is not None:
                        env_file.envs[env_file.active_env].variables[rule.target_variable] = extracted_val
                        vars_updated = True
                    else:
                        rule_errors.append({"rule_id": rule.id, "error": f"No match for '{source_path}'"})
                except Exception as ex:
                    rule_errors.append({"rule_id": rule.id, "error": str(ex)})

        if vars_updated:
            storage.save_environment(collection_id, env_file)

        # 6. Result
        result = RequestResult(
            request_id=req.id,
            status_code=resp_obj.status_code,
            duration_ms=duration,
            headers=dict(resp_obj.headers),
            body=body_content,
            body_is_json=body_is_json,
            content_type=content_type,
            body_bytes=body_bytes,
        )
        if rule_errors:
            result.error = f"Extraction issues: {rule_errors}"
        
        # 7. Log History
        storage.append_history(collection_id, result.model_dump())
        
        return result

runner = RequestRunner()
