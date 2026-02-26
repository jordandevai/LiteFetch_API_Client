import axios, { type AxiosInstance } from 'axios';

const DEFAULT_API_BASE = 'http://127.0.0.1:8333/api';

// Robust Tauri v2 detection
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

let apiClient: AxiosInstance | null = null;
let basePromise: Promise<string> | null = null;

export const resetApiClient = () => {
  apiClient = null;
  basePromise = null;
};

const resolveApiBase = async (): Promise<string> => {
  if (basePromise) return basePromise;

  basePromise = (async () => {
    if (isTauri) {
      try {
        // Dynamically import Tauri core to avoid issues in pure browser mode
        const { invoke } = await import('@tauri-apps/api/core');
        console.log('[API] Requesting backend spawn...');
        const base: string = await invoke('start_backend');
        console.log(`[API] Sidecar connected at: ${base}`);
        return base.replace(/\/$/, '');
      } catch (err) {
        console.error('[API] Tauri backend resolution failed, falling back to defaults.', err);
      }
    }
    // Fallback for Web/Dev mode
    const envBase = import.meta.env.VITE_API_BASE || (import.meta as any).env?.PUBLIC_API_BASE;
    return String(envBase || DEFAULT_API_BASE).replace(/\/$/, '');
  })();

  return basePromise;
};

const getApiClient = async (): Promise<AxiosInstance> => {
  if (apiClient) return apiClient;
  const baseURL = await resolveApiBase();
  apiClient = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return apiClient;
};

// --- Types (Pydantic Models) ---

export interface ExtractionRule {
  id: string;
  source_path: string;
  target_variable: string;
}

export interface HttpRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  body_mode?: 'raw' | 'json' | 'form-urlencoded' | 'form-data' | 'binary';
  form_body?: Array<{
    key: string;
    value?: string;
    enabled?: boolean;
    type?: 'text' | 'file' | 'binary';
    file_path?: string;
    file_inline?: string;
    file_name?: string;
    secret?: boolean;
  }>;
  query_params?: Array<{ key: string; value: string; enabled?: boolean }>;
  auth_type?: 'none' | 'basic' | 'bearer';
  auth_params?: Record<string, string>;
  extract_rules: ExtractionRule[];
  timeout_seconds?: number;
  verify_ssl?: boolean;
  secret_headers?: Record<string, boolean>;
  secret_query_params?: Record<string, boolean>;
  secret_form_fields?: Record<string, boolean>;
  secret_auth_params?: Record<string, boolean>;
  secret_body?: boolean;
  binary?: {
    file_path?: string;
    file_inline?: string;
    file_name?: string;
  } | null;
}

export interface CollectionFolder {
  id: string;
  name: string;
  items: (CollectionFolder | HttpRequest)[];
}

export interface Collection {
  id: string;
  name: string;
  items: (CollectionFolder | HttpRequest)[];
}

export interface CollectionMeta {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface CollectionBundle {
  meta: CollectionMeta;
  collection: Collection;
  environment: EnvironmentFile;
  ui_state: UiState;
  last_results: LastResults;
  history: RequestResult[];
}

export interface RequestResult {
  request_id: string;
  status_code: number;
  duration_ms: number;
  headers: Record<string, string>;
  body: Record<string, unknown> | string | null;
  body_is_json?: boolean;
  content_type?: string | null;
  body_bytes?: number;
  error?: string;
  timestamp: number;
}

export interface EnvironmentFile {
  active_env: string;
  envs: Record<string, { name: string; variables: Record<string, unknown>; secrets?: Record<string, boolean> }>;
}

export interface UiState {
  openFolders: string[];
}

export type LastResults = Record<string, RequestResult>;

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number | null;
  secure?: boolean;
  http_only?: boolean;
}

// --- API Methods ---

export const LiteAPI = {
  listCollections: async () => {
    const client = await getApiClient();
    return client.get<CollectionMeta[]>('/collections').then((r) => r.data);
  },
  createCollection: async (payload: { name: string; collection?: Collection; environment?: EnvironmentFile }) => {
    const client = await getApiClient();
    return client.post<CollectionMeta>('/collections', payload).then((r) => r.data);
  },
  deleteCollection: async (collectionId: string) => {
    const client = await getApiClient();
    return client.delete(`/collections/${collectionId}`);
  },
  getCollectionBundle: async (collectionId: string) => {
    const client = await getApiClient();
    return client.get<CollectionBundle>(`/collections/${collectionId}`).then((r) => r.data);
  },
  getCollection: async (collectionId: string) => {
    const client = await getApiClient();
    return client.get<Collection>(`/collections/${collectionId}/collection`).then((r) => r.data);
  },
  saveCollection: async (collectionId: string, col: Collection) => {
    const client = await getApiClient();
    return client.post(`/collections/${collectionId}/collection`, col);
  },

  getEnvironment: async (collectionId: string) => {
    const client = await getApiClient();
    return client.get<EnvironmentFile>(`/collections/${collectionId}/environment`).then((r) => r.data);
  },
  saveEnvironment: async (collectionId: string, env: EnvironmentFile) => {
    const client = await getApiClient();
    return client.post(`/collections/${collectionId}/environment`, env);
  },
  setPassphrase: async (passphrase: string | null) => {
    const client = await getApiClient();
    return client.post<{ status: string }>(`/workspace/passphrase`, { passphrase }).then((r) => r.data);
  },
  getWorkspaceStatus: async () => {
    const client = await getApiClient();
    return client
      .get<{ locked: boolean; legacy: boolean; has_vault?: boolean; ciphertext?: boolean }>(`/workspace/status`)
      .then((r) => r.data);
  },
  unlockWorkspace: async (passphrase: string) => {
    const client = await getApiClient();
    return client
      .post<{ status: string; migrated: { updated: number; collections: number } }>(`/workspace/unlock`, {
        passphrase,
      })
      .then((r) => r.data);
  },
  lockWorkspace: async () => {
    const client = await getApiClient();
    return client.post<{ status: string }>(`/workspace/lock`, {}).then((r) => r.data);
  },
  migrateWorkspace: async () => {
    const client = await getApiClient();
    return client.post<{ status: string; stats: Record<string, number> }>(`/workspace/migrate`).then((r) => r.data);
  },
  updateWorkspaceIgnore: async () => {
    const client = await getApiClient();
    return client.post<{ status: string }>(`/workspace/gitignore`).then((r) => r.data);
  },
  rotateWorkspacePassphrase: async (oldPass: string, newPass: string) => {
    const client = await getApiClient();
    return client.post<{ status: string }>(`/workspace/rotate`, { old: oldPass, new: newPass }).then((r) => r.data);
  },

  getUiState: async (collectionId: string) => {
    const client = await getApiClient();
    return client.get<UiState>(`/collections/${collectionId}/ui-state`).then((r) => r.data);
  },
  saveUiState: async (collectionId: string, ui: UiState) => {
    const client = await getApiClient();
    return client.post(`/collections/${collectionId}/ui-state`, ui);
  },
  getLastResults: async (collectionId: string) => {
    const client = await getApiClient();
    return client.get<LastResults>(`/collections/${collectionId}/last-results`).then((r) => r.data);
  },
  saveLastResults: async (collectionId: string, data: LastResults) => {
    const client = await getApiClient();
    return client.post(`/collections/${collectionId}/last-results`, data);
  },
  upsertLastResult: async (collectionId: string, requestId: string, result: RequestResult) => {
    const client = await getApiClient();
    return client.post(`/collections/${collectionId}/last-results/${requestId}`, result);
  },

  runRequest: async (collectionId: string, req: HttpRequest) => {
    const client = await getApiClient();
    return client.post<RequestResult>(`/collections/${collectionId}/run`, req).then((r) => r.data);
  },
  getHistory: async (collectionId: string) => {
    const client = await getApiClient();
    return client.get<RequestResult[]>(`/collections/${collectionId}/history`).then((r) => r.data);
  },

  listCookies: async (collectionId: string, envId?: string) => {
    const client = await getApiClient();
    return client
      .get<StoredCookie[]>(`/collections/${collectionId}/cookies`, {
        params: envId ? { env: envId } : undefined,
      })
      .then((r) => r.data);
  },
  upsertCookie: async (collectionId: string, cookie: StoredCookie, envId?: string) => {
    const client = await getApiClient();
    return client
      .post<StoredCookie[]>(`/collections/${collectionId}/cookies`, cookie, {
        params: envId ? { env: envId } : undefined,
      })
      .then((r) => r.data);
  },
  deleteCookies: async (
    collectionId: string,
    opts: { envId?: string; domain?: string; path?: string; name?: string } = {},
  ) => {
    const client = await getApiClient();
    return client
      .delete<StoredCookie[]>(`/collections/${collectionId}/cookies`, {
        params: {
          env: opts.envId,
          domain: opts.domain,
          path: opts.path,
          name: opts.name,
        },
      })
      .then((r) => r.data);
  },

  getWorkspace: async () => {
    const client = await getApiClient();
    return client.get<{ path: string }>('/workspace').then((r) => r.data);
  },
  setWorkspace: async (path: string) => {
    const client = await getApiClient();
    return client.post<{ path: string }>('/workspace', { path }).then((r) => r.data);
  },
  initWorkspaceGit: async () => {
    const client = await getApiClient();
    return client.post<{ status: string; output?: string }>('/workspace/git/init').then((r) => r.data);
  },
};
