import type { FormValues } from '../../components/request/requestEditorModel';

export type RequestRevisionSnapshot = FormValues;

export const cloneRevisionSnapshot = (snapshot: RequestRevisionSnapshot): RequestRevisionSnapshot =>
  structuredClone(snapshot);

const hashText = (value: string, maxSamples = 4096): string => {
  const input = value || '';
  let hash = 2166136261;
  if (input.length <= maxSamples) {
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  } else {
    const step = Math.max(1, Math.floor(input.length / maxSamples));
    for (let i = 0; i < input.length; i += step) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${(hash >>> 0).toString(16)}:${input.length}`;
};

const rowListFingerprint = (
  rows:
    | Array<{
        key?: string;
        value?: string;
        enabled?: boolean;
        secret?: boolean;
        type?: string;
        file_path?: string;
        file_name?: string;
        file_inline?: string;
      }>
    | undefined,
) =>
  (rows || [])
    .map(
      (row) =>
        `${row.enabled === false ? 0 : 1}:${row.secret ? 1 : 0}:${row.type || ''}:${row.key || ''}=${
          row.value || ''
        }:${row.file_path || ''}:${row.file_name || ''}:${hashText(row.file_inline || '', 256)}`,
    )
    .join('\u001f');

export const getRevisionSnapshotHash = (snapshot: RequestRevisionSnapshot): string => {
  const authPairs = Object.entries(snapshot.auth_params || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v || ''}`)
    .join('\u001f');
  const extractPairs = (snapshot.extract_rules || [])
    .map((rule) => `${rule.source_path || ''}->${rule.target_variable || ''}`)
    .join('\u001f');
  const fingerprintInput = [
    snapshot.name || '',
    snapshot.method || '',
    snapshot.url || '',
    snapshot.body_mode || '',
    hashText(snapshot.body || '', 8192),
    rowListFingerprint(snapshot.headers),
    rowListFingerprint(snapshot.query_params),
    rowListFingerprint(snapshot.form_body),
    `${snapshot.auth_type || 'none'}:${authPairs}`,
    extractPairs,
    snapshot.secret_body ? 'secret' : 'plain',
    snapshot.binary?.file_name || '',
    snapshot.binary?.file_path || '',
    hashText(snapshot.binary?.file_inline || '', 2048),
  ].join('\u001e');
  return hashText(fingerprintInput, 8192);
};

export const MAX_REVISIONS_PER_REQUEST = 30;
