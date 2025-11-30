import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';
import { Play, Save, Plus, Trash2, Upload } from 'lucide-react';
import { useForm, useFieldArray, useWatch, type Control } from 'react-hook-form';
import { useActiveRequestStore } from '../../stores/useActiveRequestStore';
import { useActiveCollectionStore } from '../../stores/useActiveCollectionStore';
import { useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type ExtractionRule, type HttpRequest } from '../../lib/api';
import {
  useActiveRequestFromCollection,
  useSaveRequestMutation,
} from '../../hooks/useCollectionData';
import { useSaveLastResultMutation } from '../../hooks/useLastResults';
import { useHotkeys } from '../../hooks/useHotkeys';
import { FormTable } from './FormTable';
import { FormDataTable, type FormDataRow } from './FormDataTable';
import { HeadersTable, HeaderRow } from './HeadersTable';
import { cn } from '../../lib/utils';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      } else if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        let binary = '';
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        resolve(btoa(binary));
      } else {
        reject(new Error('Unsupported file result'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });

const BinaryPickerButton = ({
  onPick,
  disabled,
  current,
}: {
  onPick: (payload: { file_path?: string; file_inline?: string; file_name?: string } | null) => void;
  disabled?: boolean;
  current: { file_path?: string; file_inline?: string; file_name?: string } | null;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ multiple: false });
        if (!selected || Array.isArray(selected)) return;
        const parts = String(selected).split(/[\\/]/);
        onPick({ file_path: String(selected), file_inline: undefined, file_name: parts[parts.length - 1] || 'upload.bin' });
      } catch (e) {
        console.error('Binary pick failed', e);
      }
      return;
    }
    inputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      onPick({ file_inline: b64, file_name: file.name, file_path: undefined });
    } catch (err) {
      console.error('Binary file read failed', err);
    }
  };

  return (
    <>
      <button
        type="button"
        className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium flex items-center gap-1"
        onClick={handlePick}
        disabled={disabled}
      >
        <Upload size={14} />
        {current?.file_path || current?.file_inline ? 'Replace file' : 'Pick file'}
      </button>
      <input type="file" className="hidden" ref={inputRef} onChange={onFileChange} />
    </>
  );
};

type FormValues = {
  name: string;
  method: string;
  url: string;
  body: string;
  body_mode: 'raw' | 'json' | 'form-urlencoded' | 'form-data' | 'binary';
  headers: HeaderRow[];
  extract_rules: ExtractionRule[];
  form_body: FormDataRow[];
  query_params: Array<{ key: string; value: string; enabled?: boolean; secret?: boolean }>;
  auth_type: 'none' | 'basic' | 'bearer';
  auth_params: Record<string, string>;
  secret_headers: Record<string, boolean>;
  secret_query_params: Record<string, boolean>;
  secret_form_fields: Record<string, boolean>;
  secret_auth_params: Record<string, boolean>;
  secret_body: boolean;
  binary: { file_path?: string; file_inline?: string; file_name?: string } | null;
};

const toHeadersArray = (headers: Record<string, string> = {}): HeaderRow[] =>
  Object.entries(headers).map(([key, value]) => ({ key, value, enabled: true }));

const toHeadersRecord = (rows: HeaderRow[]) => {
  const next: Record<string, string> = {};
  rows.forEach(({ key, value, enabled }) => {
    const trimmed = key.trim();
    // Only include enabled headers
    if (trimmed && enabled !== false) next[trimmed] = value;
  });
  return next;
};

const normalizeJMESPath = (path: string) => {
  const trimmed = path.trim();
  const prefixes = ['body.', 'response.', '$.'];
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return trimmed;
};

type HeadersTabProps = {
  control: Control<FormValues>;
  onHeadersChange: (headers: HeaderRow[]) => void;
};

const EMPTY_HEADER: HeaderRow = { key: '', value: '', enabled: true };

const HeadersTab = React.memo(({ control, onHeadersChange }: HeadersTabProps) => {
  const { fields, replace } = useFieldArray({ control, name: 'headers' });
  const headers = useWatch({ control, name: 'headers' }) as HeaderRow[] | undefined;

  // Keep at least one row present
  useEffect(() => {
    if (!fields.length) {
      replace([EMPTY_HEADER]);
    }
  }, [fields.length, replace]);

  const handleReplace = useCallback(
    (rows: HeaderRow[]) => {
      replace(rows);
      onHeadersChange(rows);
    },
    [onHeadersChange, replace],
  );

  return (
    <div className="p-4 bg-card h-full">
      <HeadersTable
        headers={headers || [EMPTY_HEADER]}
        onChange={handleReplace}
        showSecrets
      />
    </div>
  );
});
HeadersTab.displayName = 'HeadersTab';

export const RequestEditor = () => {
  const { activeRequestId, setIsRunning, setResult, setSentRequest } = useActiveRequestStore();
  const activeRequest = useActiveRequestFromCollection(activeRequestId);
  const { mutateAsync: saveRequest, isPending: isSaving } = useSaveRequestMutation();
  const { mutateAsync: saveLastResult } = useSaveLastResultMutation();
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'params' | 'auth' | 'settings'>('body');
  const [showUrlEditor, setShowUrlEditor] = useState(false);
  const { isLocked, openModal } = useWorkspaceLockStore();
  const syncingFromUrl = useRef(false);
  const syncingFromParams = useRef(false);
  const [paramEditor, setParamEditor] = useState<{
    index: number;
    key: string;
    value: string;
  } | null>(null);
  useHotkeys([
    { combo: 'mod+s', handler: () => handleSave() },
    { combo: 'mod+enter', handler: () => handleRun() },
  ]);

  const {
    control,
    register,
    reset,
    watch,
    setValue,
    getValues,
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      method: 'GET',
      url: '',
      body: '',
      body_mode: 'raw',
      headers: [],
      extract_rules: [],
      form_body: [],
      query_params: [],
      auth_type: 'none',
      auth_params: {},
      secret_headers: {},
      secret_query_params: {},
      secret_form_fields: {},
      secret_auth_params: {},
      secret_body: false,
      binary: null,
    },
  });
  const urlValue = watch('url');
  const queryParams = watch('query_params');
  const authType = watch('auth_type');
  const authParams = watch('auth_params');
  const secretBody = watch('secret_body');
  const secretAuthParams = watch('secret_auth_params');

  const queryClient = useQueryClient();
  const activeCollectionId = useActiveCollectionStore((s) => s.activeId);

  const { fields: ruleFields, append: appendRule, remove: removeRule } = useFieldArray({
    control,
    name: 'extract_rules',
  });

  const normalizeUrlForParse = useCallback((url: string) => {
    return url.replace(/\?\?/g, '?').replace(/%3F/gi, '?');
  }, []);

  const parseQueryParamsFromUrl = useCallback(
    (url: string): Array<{ key: string; value: string; enabled?: boolean; secret?: boolean }> => {
      try {
        const normalized = normalizeUrlForParse(url);
        const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized);
        const parsed = new URL(normalized, hasProtocol ? undefined : 'http://placeholder.local');
        // Normalize double/leading ? in search
        if (parsed.search.startsWith('??')) {
          parsed.search = parsed.search.replace(/^\?+/, '?');
        }
        const params: Array<{ key: string; value: string; enabled?: boolean; secret?: boolean }> = [];
        parsed.searchParams.forEach((value, key) => {
          const cleanKey = key.replace(/^\?+/, '');
          params.push({ key: cleanKey, value, enabled: true });
        });
        return params.length ? params : [{ key: '', value: '', enabled: true }];
      } catch {
        return [{ key: '', value: '', enabled: true }];
      }
    },
    [normalizeUrlForParse],
  );

  const buildUrlWithParams = useCallback((url: string, params: Array<{ key: string; value: string; enabled?: boolean }>) => {
    try {
      const normalized = normalizeUrlForParse(url || '');
      const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized);
      const parsed = new URL(normalized, hasProtocol ? undefined : 'http://placeholder.local');
      const next = new URLSearchParams();
      (params || []).forEach((row) => {
        if (row.enabled === false) return;
        const key = (row.key || '').trim();
        if (!key) return;
        next.append(key, row.value ?? '');
      });
      parsed.search = next.toString() ? `?${next.toString()}` : '';
      if (hasProtocol) {
        return parsed.toString();
      }
      return `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`;
    } catch {
      return url;
    }
  }, []);

  const deriveAuthFromHeaders = useCallback(
    (headers: Record<string, string> | undefined, currentType: FormValues['auth_type'], currentParams: Record<string, string>) => {
      const authHeader = headers?.Authorization || headers?.authorization;
      if (!authHeader) return { auth_type: currentType, auth_params: currentParams };
      if (currentType && currentType !== 'none') return { auth_type: currentType, auth_params: currentParams };

      if (/^Bearer\s+/i.test(authHeader)) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        return { auth_type: 'bearer' as const, auth_params: { token } };
      }
      if (/^Basic\s+/i.test(authHeader)) {
        const b64 = authHeader.replace(/^Basic\s+/i, '').trim();
        try {
          const decoded = atob(b64);
          const idx = decoded.indexOf(':');
          const username = idx >= 0 ? decoded.slice(0, idx) : decoded;
          const password = idx >= 0 ? decoded.slice(idx + 1) : '';
          return { auth_type: 'basic' as const, auth_params: { username, password } };
        } catch {
          return { auth_type: currentType, auth_params: currentParams };
        }
      }
      return { auth_type: currentType, auth_params: currentParams };
    },
    [],
  );

  // Reset form when active request changes
  useEffect(() => {
    if (!activeRequest) return;
    const headersRecord = activeRequest.headers || {};
    const derived = deriveAuthFromHeaders(headersRecord, (activeRequest.auth_type as any) || 'none', activeRequest.auth_params || {});
    const secretHeaderMap = activeRequest.secret_headers || {};
    const secretQueryMap = activeRequest.secret_query_params || {};
    const secretFormMap = activeRequest.secret_form_fields || {};
    const secretAuthMap = activeRequest.secret_auth_params || {};
    reset({
      name: activeRequest.name,
      method: activeRequest.method,
      url: activeRequest.url,
      body:
        typeof activeRequest.body === 'string'
          ? activeRequest.body || ''
          : JSON.stringify(activeRequest.body ?? {}, null, 2),
      headers: toHeadersArray(headersRecord).map((row) => ({
        ...row,
        secret: Boolean(secretHeaderMap[row.key]),
      })),
      extract_rules: activeRequest.extract_rules ?? [],
      body_mode: activeRequest.body_mode || 'raw',
      form_body: (activeRequest.form_body || []).map((row) => ({
        ...row,
        type: (row.type as any) || 'text',
        secret: Boolean(secretFormMap[row.key || '']),
      })),
      query_params: (activeRequest.query_params?.length
        ? activeRequest.query_params
        : parseQueryParamsFromUrl(activeRequest.url)
      ).map((row) => ({
        ...row,
        secret: Boolean(secretQueryMap[row.key || '']),
      })),
      auth_type: derived.auth_type,
      auth_params: derived.auth_params,
      secret_headers: secretHeaderMap,
      secret_query_params: secretQueryMap,
      secret_form_fields: secretFormMap,
      secret_auth_params: secretAuthMap,
      secret_body: Boolean(activeRequest.secret_body),
      binary: activeRequest.binary || null,
    });
  }, [activeRequest, reset, parseQueryParamsFromUrl, deriveAuthFromHeaders]);

  // Sync URL -> Params
  useEffect(() => {
    if (syncingFromParams.current) {
      syncingFromParams.current = false;
      return;
    }
    const parsed = parseQueryParamsFromUrl(urlValue || '');
    syncingFromUrl.current = true;
    setValue('query_params', parsed, { shouldDirty: false });
  }, [parseQueryParamsFromUrl, setValue, urlValue]);

  // Sync Params -> URL
  useEffect(() => {
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const nextUrl = buildUrlWithParams(urlValue || '', queryParams || []);
    if (nextUrl !== urlValue) {
      syncingFromParams.current = true;
      setValue('url', nextUrl, { shouldDirty: true });
    }
  }, [buildUrlWithParams, queryParams, setValue, urlValue]);

  const buildRequest = useMemo(() => {
    return (values: FormValues): HttpRequest => {
      const headersRecord = toHeadersRecord(values.headers || []);
      const secretHeaders: Record<string, boolean> = {};
      (values.headers || []).forEach((row) => {
        const key = (row.key || '').trim();
        if (key && row.secret) secretHeaders[key] = true;
      });

      const secretQuery: Record<string, boolean> = {};
      (values.query_params || []).forEach((row) => {
        const key = (row.key || '').trim();
        if (key && row.secret) secretQuery[key] = true;
      });

      const secretForm: Record<string, boolean> = {};
      (values.form_body || []).forEach((row) => {
        const key = (row.key || '').trim();
        const rowType = (row.type || 'text').toLowerCase();
        if (rowType === 'text' && key && row.secret) secretForm[key] = true;
      });

      const secretAuth: Record<string, boolean> = {};
      Object.entries(values.secret_auth_params || {}).forEach(([k, v]) => {
        if (v) secretAuth[k] = true;
      });

      return {
        ...activeRequest!,
        name: values.name || 'New Request',
        method: values.method,
        url: values.url,
        headers: headersRecord,
        query_params: values.query_params || [],
        auth_type: values.auth_type,
        auth_params: values.auth_params || {},
        body: values.body ?? null,
        body_mode: values.body_mode,
        form_body: values.form_body ?? [],
        extract_rules: (values.extract_rules ?? []).map((rule) => ({
          ...rule,
          source_path: normalizeJMESPath(rule.source_path || ''),
        })),
        secret_headers: secretHeaders,
        secret_query_params: secretQuery,
        secret_form_fields: secretForm,
        secret_auth_params: secretAuth,
        secret_body: Boolean(values.secret_body),
        binary: values.binary || null,
      };
    };
  }, [activeRequest]);

  const prepareForSend = (req: HttpRequest): HttpRequest => {
    const headers = { ...(req.headers || {}) };
    let body = req.body;
    let formBody = req.form_body || [];
    let binaryPayload = req.binary || null;

    if (req.body_mode === 'json' && body && typeof body !== 'string') {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    // Strip empty form rows
    if (req.body_mode === 'form-urlencoded' || req.body_mode === 'form-data') {
      formBody = (formBody || []).filter((row) => {
        if (row.enabled === false) return false;
        const key = (row.key || '').trim();
        if (!key) return false;
        if ((row.type || 'text') === 'text') {
          return true;
        }
        // For file/binary rows, ensure at least a path or inline blob exists
        return Boolean(row.file_path || row.file_inline);
      });
    }

    // For urlencoded and form-data, pass through form_body so backend can construct payload/multipart.
    // Avoid pre-encoding here to keep file paths intact for backend multipart assembly.
    if (req.body_mode === 'form-urlencoded' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    // Do NOT set Content-Type for multipart/form-data; httpx will set the boundary.

    if (req.body_mode !== 'binary') {
      binaryPayload = null;
    }

    return { ...req, headers, body: body ?? null, form_body: formBody, binary: binaryPayload };
  };

  const handleSave = async () => {
    if (!activeRequest || !activeCollectionId) return;
    const updated = buildRequest(getValues());
    await saveRequest(updated);
  };

  const handleRun = async () => {
    if (isLocked) {
      return;
    }
    if (!activeRequest || !activeCollectionId) return;
    const baseReq = buildRequest(getValues());
    const prepared = prepareForSend(baseReq);
    setSentRequest(prepared.id, prepared);
    setIsRunning(true);
    try {
      await saveRequest(baseReq);
      const res = await LiteAPI.runRequest(activeCollectionId, prepared);
      setResult(res, prepared.id);
      await saveLastResult({ result: res });
      queryClient.invalidateQueries({ queryKey: ['environment', activeCollectionId] }); // refresh env to reflect extracted vars
    } catch (e) {
      console.error(e);
      setResult({
        request_id: activeRequest.id,
        status_code: 0,
        duration_ms: 0,
        headers: {},
        body: {},
        error: 'Failed to contact local backend',
        timestamp: Date.now() / 1000,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const bodyValue = watch('body');
  const bodyMode = watch('body_mode');
  const binary = watch('binary');

  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm bg-muted/30">
        Workspace is locked. Unlock to view or edit requests and send runs.
        <button
          className="ml-3 px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:opacity-90"
          onClick={openModal}
          type="button"
        >
          Unlock
        </button>
      </div>
    );
  }

  if (!activeRequest) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Select a request to edit</div>;
  }

  if (!activeCollectionId) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Select or create a collection first</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* URL Bar */}
      <div className="p-4 border-b border-border flex gap-2 bg-card">
        <select
          className="bg-white border border-input rounded px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          {...register('method')}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>

        <input
          className="flex-1 bg-white border border-input rounded px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          {...register('url')}
          placeholder="http://localhost:8000/api..."
          onDoubleClick={() => setShowUrlEditor(true)}
        />
        <button
          className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
          onClick={() => setShowUrlEditor(true)}
          type="button"
        >
          Expand
        </button>

        <button
          className="bg-muted hover:bg-secondary text-foreground px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors disabled:opacity-50 font-medium"
          onClick={handleSave}
          title="Save Changes (Cmd+S)"
          type="button"
          disabled={isSaving || isLocked}
        >
          <Save size={14} />
        </button>
        <button
          className="bg-success hover:opacity-90 text-success-foreground px-5 py-2 rounded flex items-center gap-2 text-sm font-semibold transition-opacity"
          onClick={handleRun}
          type="button"
          disabled={isLocked}
        >
          <Play size={14} /> Send
        </button>
      </div>
      {showUrlEditor && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-6">
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-4xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm font-semibold">Edit URL</div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
                  onClick={() => {
                    setValue('url', watch('url').trim(), { shouldDirty: true });
                    setShowUrlEditor(false);
                  }}
                  type="button"
                >
                  Save & Close
                </button>
                <button
                  className="px-4 py-2 text-sm rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
                  onClick={() => setShowUrlEditor(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
            <textarea
              className="w-full h-[28rem] border border-input rounded px-4 py-4 font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={watch('url')}
              onChange={(e) => setValue('url', e.target.value, { shouldDirty: true })}
            />
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        {['body', 'headers', 'params', 'auth', 'settings'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={cn(
              'px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-white relative">
        {activeTab === 'body' && (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="text-xs uppercase text-muted-foreground">Body type</span>
              {[
                { key: 'raw', label: 'Raw' },
                { key: 'json', label: 'JSON' },
                { key: 'form-urlencoded', label: 'x-www-form-urlencoded' },
                { key: 'form-data', label: 'form-data' },
                { key: 'binary', label: 'binary' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1 rounded border cursor-pointer',
                    bodyMode === opt.key ? 'border-primary bg-muted/40' : 'border-border hover:bg-muted/30'
                  )}
                >
                  <input
                    type="radio"
                    className="accent-primary"
                    checked={bodyMode === opt.key}
                    onChange={() => setValue('body_mode', opt.key as any, { shouldDirty: true })}
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
              <button
                type="button"
                className={cn(
                  "text-[11px] px-2 py-1 rounded border transition-colors",
                  secretBody ? "bg-amber-50 border-amber-300 text-amber-700" : "border-border text-muted-foreground hover:bg-muted/40"
                )}
                onClick={() => setValue('secret_body', !secretBody, { shouldDirty: true })}
              >
                {secretBody ? 'Body marked secret' : 'Mark body as secret'}
              </button>
            </div>
            {(bodyMode === 'raw' || bodyMode === 'json') && (
              <Editor
                value={bodyValue}
                onValueChange={(code) => setValue('body', code, { shouldDirty: true })}
                highlight={(code) => highlight(code, languages.json, 'json')}
                padding={16}
                style={{ fontFamily: '"Fira code", "Fira Mono", monospace', fontSize: 14, minHeight: '100%' }}
                className="min-h-full border border-input rounded bg-white focus-within:ring-2 focus-within:ring-primary focus-within:border-primary"
              />
            )}
            {bodyMode === 'form-urlencoded' && (
              <FormTable
                rows={watch('form_body')}
                onChange={(rows) => setValue('form_body', rows, { shouldDirty: true })}
                allowFile={false}
                showSecrets
              />
            )}
            {bodyMode === 'form-data' && (
              <FormDataTable
                rows={watch('form_body')}
                onChange={(rows) => setValue('form_body', rows, { shouldDirty: true })}
              />
            )}
            {bodyMode === 'binary' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Send a single binary payload. Choose a file path (desktop) or attach inline (browser).
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-transparent border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="File path or leave blank to pick"
                    value={binary?.file_path || ''}
                    onChange={(e) => setValue('binary', { ...(binary || {}), file_path: e.target.value, file_inline: undefined }, { shouldDirty: true })}
                  />
                  <BinaryPickerButton
                    onPick={(payload) => setValue('binary', payload, { shouldDirty: true })}
                    disabled={isLocked}
                    current={binary}
                  />
                </div>
                {binary?.file_name && !binary.file_path && (
                  <div className="text-[11px] text-muted-foreground px-1">
                    Attached inline: {binary.file_name}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {activeTab === 'headers' && (
          <HeadersTab
            control={control}
            onHeadersChange={(headers) => setValue('headers', headers, { shouldDirty: true })}
          />
        )}
        {activeTab === 'params' && (
          <div className="p-4 bg-card h-full">
            <div className="text-xs uppercase text-muted-foreground mb-2">Query Parameters</div>
            <p className="text-xs text-muted-foreground mb-3">
              Add key/value pairs to append to the URL. Disabled rows are ignored.
            </p>
            <FormTable
              rows={queryParams || []}
              onChange={(rows) =>
                setValue(
                  'query_params',
                  rows.map((r) => ({ ...r, value: r.value ?? '' })),
                  { shouldDirty: true },
                )
              }
              // Allow modal editing of long values
              onEditRow={(idx) => {
                const row = (queryParams || [])[idx];
                if (!row) return;
                setParamEditor({ index: idx, key: row.key || '', value: row.value || '' });
              }}
              showSecrets
            />
          </div>
        )}
        {activeTab === 'auth' && (
          <div className="p-4 bg-card h-full space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={authType === 'none'}
                  onChange={() => setValue('auth_type', 'none', { shouldDirty: true })}
                />
                None
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={authType === 'basic'}
                  onChange={() => setValue('auth_type', 'basic', { shouldDirty: true })}
                />
                Basic
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={authType === 'bearer'}
                  onChange={() => setValue('auth_type', 'bearer', { shouldDirty: true })}
                />
                Bearer
              </label>
            </div>

            {authType === 'basic' && (
              <div className="grid grid-cols-2 gap-3 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase text-muted-foreground">Username</label>
                  <input
                    className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={authParams?.username || ''}
                    onChange={(e) =>
                      setValue(
                        'auth_params',
                        { ...authParams, username: e.target.value },
                        { shouldDirty: true },
                      )
                    }
                  />
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={Boolean(secretAuthParams?.username)}
                      onChange={(e) =>
                        setValue('secret_auth_params', { ...secretAuthParams, username: e.target.checked }, { shouldDirty: true })
                      }
                    />
                    Mark username as secret
                  </label>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase text-muted-foreground">Password</label>
                  <input
                    type="password"
                    className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={authParams?.password || ''}
                    onChange={(e) =>
                      setValue(
                        'auth_params',
                        { ...authParams, password: e.target.value },
                        { shouldDirty: true },
                      )
                    }
                  />
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={Boolean(secretAuthParams?.password ?? true)}
                      onChange={(e) =>
                        setValue('secret_auth_params', { ...secretAuthParams, password: e.target.checked }, { shouldDirty: true })
                      }
                    />
                    Mark password as secret
                  </label>
                </div>
              </div>
            )}

            {authType === 'bearer' && (
              <div className="max-w-2xl">
                <label className="text-xs uppercase text-muted-foreground">Token</label>
                <input
                  className="w-full bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  value={authParams?.token || ''}
                  onChange={(e) =>
                    setValue('auth_params', { ...authParams, token: e.target.value }, { shouldDirty: true })
                  }
                  placeholder="eyJhbGciOi..."
                />
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={Boolean(secretAuthParams?.token ?? true)}
                    onChange={(e) =>
                      setValue('secret_auth_params', { ...secretAuthParams, token: e.target.checked }, { shouldDirty: true })
                    }
                  />
                  Mark token as secret
                </label>
              </div>
            )}

            {authType === 'none' && (
              <p className="text-xs text-muted-foreground">
                No Authorization header will be added. Use Basic or Bearer to auto-insert the header.
              </p>
            )}
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="bg-card h-full p-4">
            <div className="mb-6">
              <h3 className="text-sm font-bold text-muted-foreground mb-2">Auto-Magic Extraction</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Automatically capture data from the JSON response and save it to the Environment.
              </p>

              <div className="space-y-2">
                {ruleFields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="flex gap-2 items-center bg-muted/10 p-2 rounded border border-border"
                  >
                    <div className="flex-1">
                      <div className="text-[10px] uppercase text-muted-foreground">Source (JMESPath)</div>
                      <input
                        className="w-full bg-transparent font-mono text-sm focus:outline-none"
                        {...register(`extract_rules.${idx}.source_path`)}
                      />
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <div className="flex-1">
                      <div className="text-[10px] uppercase text-muted-foreground">Target Variable</div>
                      <input
                        className="w-full bg-transparent font-mono text-sm text-yellow-500 focus:outline-none"
                        {...register(`extract_rules.${idx}.target_variable`)}
                      />
                    </div>
                    <button
                      onClick={() => removeRule(idx)}
                      className="text-destructive hover:bg-destructive/10 p-2 rounded transition-colors"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() =>
                    appendRule({
                      id: `rule-${Date.now()}`,
                      source_path: 'id',
                      target_variable: 'extracted_value',
                    })
                  }
                  className="w-full py-2 flex items-center justify-center gap-2 border border-dashed border-border rounded hover:bg-muted/20 text-xs text-muted-foreground"
                  type="button"
                >
                  <Plus size={14} /> Add Extraction Rule
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Param Value Editor */}
      {paramEditor && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
          <div className="w-full max-w-3xl bg-card border border-border rounded shadow-xl">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Edit Query Parameter</div>
                <div className="text-xs text-muted-foreground">Index #{paramEditor.index + 1}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-xs rounded border border-border bg-white hover:bg-muted transition-colors"
                  onClick={() => setParamEditor(null)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  onClick={() => {
                    const rows = [...(queryParams || [])];
                    rows[paramEditor.index] = {
                      ...(rows[paramEditor.index] || { enabled: true }),
                      key: paramEditor.key,
                      value: paramEditor.value,
                    };
                    setValue('query_params', rows, { shouldDirty: true });
                    setParamEditor(null);
                  }}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-muted-foreground">Key</label>
                <input
                  className="w-full bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  value={paramEditor.key}
                  onChange={(e) => setParamEditor({ ...paramEditor, key: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-muted-foreground">Value</label>
                <textarea
                  className="w-full min-h-[220px] bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  value={paramEditor.value}
                  onChange={(e) => setParamEditor({ ...paramEditor, value: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
