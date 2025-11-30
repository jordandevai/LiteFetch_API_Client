import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { useEnvironmentQuery } from '../../hooks/useEnvironmentData';
import { useCookiesQuery, useDeleteCookieMutation, useUpsertCookieMutation } from '../../hooks/useCookies';
import type { StoredCookie } from '../../lib/api';

type CookieManagerProps = {
  open: boolean;
  onClose: () => void;
};

const blankCookie: StoredCookie = {
  name: '',
  value: '',
  domain: '',
  path: '/',
  expires: null,
  secure: false,
  http_only: false,
};

const toInputDate = (expires?: number | null) => {
  if (!expires) return '';
  const date = new Date(expires * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
};

const fromInputDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  const ts = parsed.getTime();
  if (Number.isNaN(ts)) return null;
  return ts / 1000;
};

export const CookieManager = ({ open, onClose }: CookieManagerProps) => {
  const { data: envData } = useEnvironmentQuery();
  const envOptions = useMemo(() => Object.keys(envData?.envs || {}), [envData]);
  const [envId, setEnvId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const showStatus = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setStatus({ message, tone });
    window.setTimeout(() => setStatus(null), 2500);
  };

  useEffect(() => {
    if (envData) setEnvId(envData.active_env);
  }, [envData]);

  const { data: cookies = [], isLoading } = useCookiesQuery(envId);
  const upsertCookie = useUpsertCookieMutation(envId);
  const deleteCookie = useDeleteCookieMutation(envId);

  const [editing, setEditing] = useState<StoredCookie | null>(null);
  const [form, setForm] = useState<StoredCookie>(blankCookie);
  const [hiddenHttpOnlyValue, setHiddenHttpOnlyValue] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setHiddenHttpOnlyValue(editing.http_only ? editing.value : null);
      setForm({
        ...blankCookie,
        ...editing,
        value: editing.http_only ? '' : editing.value,
        path: editing.path || '/',
      });
    } else {
      setHiddenHttpOnlyValue(null);
      setForm(blankCookie);
    }
  }, [editing]);

  const saveCookie = async () => {
    if (!envId) return;
    if (!form.name.trim() || !form.domain.trim()) {
      showStatus('Name and domain are required', 'error');
      return;
    }
    const value =
      form.http_only && !form.value && hiddenHttpOnlyValue ? hiddenHttpOnlyValue : form.value;
    const payload: StoredCookie = {
      ...form,
      value,
      path: form.path || '/',
      expires: form.expires ?? null,
    };
    await upsertCookie.mutateAsync(payload);
    showStatus(editing ? 'Cookie updated' : 'Cookie added', 'success');
    setEditing(null);
  };

  const handleDelete = async (cookie: StoredCookie) => {
    if (!envId) return;
    const confirmed = window.confirm(`Delete cookie ${cookie.name} on ${cookie.domain}?`);
    if (!confirmed) return;
    await deleteCookie.mutateAsync({
      domain: cookie.domain,
      path: cookie.path || '/',
      name: cookie.name,
    });
    showStatus('Cookie deleted', 'success');
  };

  const handleClear = async () => {
    if (!envId) return;
    const confirmed = window.confirm('Clear all cookies for this environment?');
    if (!confirmed) return;
    await deleteCookie.mutateAsync({});
    showStatus('Cookies cleared', 'success');
  };

  if (!open) return null;

  const selectedEnvName = envId ? envData?.envs?.[envId]?.name || envId : '';

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex justify-end">
      <div className="w-full max-w-5xl h-full bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Cookie Manager</div>
            <div className="text-xs text-muted-foreground">
              Manage per-environment cookie jar (saved automatically on requests)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-white border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={envId || ''}
              onChange={(e) => setEnvId(e.target.value || null)}
            >
              {envOptions.map((key) => (
                <option key={key} value={key}>
                  {envData?.envs?.[key]?.name || key}
                </option>
              ))}
            </select>
            <button
              className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors font-medium"
              onClick={onClose}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {status && (
          <div
            className={`px-4 py-2 text-xs ${
              status.tone === 'error'
                ? 'bg-destructive/10 text-destructive'
                : status.tone === 'success'
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {status.message}
          </div>
        )}

        <div className="flex-1 overflow-hidden p-4 space-y-4">
          {!envId && (
            <div className="text-sm text-muted-foreground">Select an environment to manage cookies.</div>
          )}

          {envId && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Cookies for <span className="text-primary">{selectedEnvName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors font-medium"
                    onClick={() => setEditing(null)}
                    type="button"
                  >
                    <Plus size={14} className="inline mr-1" /> Add Cookie
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors font-medium"
                    onClick={handleClear}
                    type="button"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="border border-border rounded overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 text-xs uppercase text-muted-foreground">
                  Stored Cookies
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">Domain</th>
                        <th className="text-left px-3 py-2">Path</th>
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Value</th>
                        <th className="text-left px-3 py-2">Expires</th>
                        <th className="text-left px-3 py-2">Flags</th>
                        <th className="text-left px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading && (
                        <tr>
                          <td className="px-3 py-3 text-sm text-muted-foreground" colSpan={7}>
                            Loading cookies...
                          </td>
                        </tr>
                      )}
                      {!isLoading && cookies.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={7}>
                            No cookies stored for this environment.
                          </td>
                        </tr>
                      )}
                      {!isLoading &&
                        cookies.map((cookie) => {
                          const expiresText = cookie.expires
                            ? new Date(cookie.expires * 1000).toLocaleString()
                            : 'Session';
                          const flags = [
                            cookie.secure ? 'Secure' : null,
                            cookie.http_only ? 'HttpOnly' : null,
                          ]
                            .filter(Boolean)
                            .join(' • ') || '—';
                          return (
                            <tr key={`${cookie.domain}|${cookie.path}|${cookie.name}`} className="hover:bg-muted/40">
                              <td className="px-3 py-2 font-mono text-xs">{cookie.domain}</td>
                              <td className="px-3 py-2 font-mono text-xs">{cookie.path || '/'}</td>
                              <td className="px-3 py-2 font-mono text-xs">{cookie.name}</td>
                              <td className="px-3 py-2 font-mono text-xs">
                                {cookie.http_only ? 'HttpOnly (hidden)' : cookie.value}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{expiresText}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{flags}</td>
                              <td className="px-3 py-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <button
                                    className="p-1 rounded hover:bg-muted"
                                    onClick={() => setEditing(cookie)}
                                    type="button"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                                    onClick={() => handleDelete(cookie)}
                                    type="button"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-border rounded p-3 bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">
                    {editing ? `Edit ${editing.name}` : 'Add Cookie'}
                  </div>
                  {editing && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setEditing(null)}
                      type="button"
                    >
                      New instead
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground uppercase">Name</label>
                    <input
                      className="bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground uppercase">Value</label>
                    <input
                      className="bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      value={form.value || ''}
                      placeholder={form.http_only ? 'HttpOnly value hidden; set to replace' : ''}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground uppercase">Domain</label>
                    <input
                      className="bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      value={form.domain}
                      onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground uppercase">Path</label>
                    <input
                      className="bg-white border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      value={form.path || '/'}
                      onChange={(e) => setForm({ ...form, path: e.target.value || '/' })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground uppercase">Expires</label>
                    <input
                      type="datetime-local"
                      className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      value={toInputDate(form.expires ?? null)}
                      onChange={(e) => setForm({ ...form, expires: fromInputDate(e.target.value) })}
                    />
                    <span className="text-[11px] text-muted-foreground">Leave blank for session cookie</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground uppercase">Flags</label>
                    <div className="flex items-center gap-4 px-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!form.secure}
                          onChange={(e) => setForm({ ...form, secure: e.target.checked })}
                        />
                        Secure
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!form.http_only}
                          onChange={(e) => setForm({ ...form, http_only: e.target.checked })}
                        />
                        HttpOnly
                      </label>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded border border-border bg-white hover:bg-muted transition-colors"
                    onClick={() => setEditing(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
                    onClick={saveCookie}
                    type="button"
                  >
                    {editing ? 'Save Changes' : 'Add Cookie'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
