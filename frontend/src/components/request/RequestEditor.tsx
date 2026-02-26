import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useActiveRequestStore } from '../../stores/useActiveRequestStore';
import { useActiveCollectionStore } from '../../stores/useActiveCollectionStore';
import { useQueryClient } from '@tanstack/react-query';
import { LiteAPI, type HttpRequest } from '../../lib/api';
import {
  useActiveRequestFromCollection,
  useSaveRequestMutation,
} from '../../hooks/useCollectionData';
import { useSaveLastResultMutation } from '../../hooks/useLastResults';
import { useEnvironmentQuery } from '../../hooks/useEnvironmentData';
import { useHotkeys } from '../../hooks/useHotkeys';
import { cn } from '../../lib/utils';
import { useWorkspaceLockStore } from '../../stores/useWorkspaceLockStore';
import { useRequestRevisionStore } from '../../stores/useRequestRevisionStore';
import { useUnsavedChangesGuard } from '../../lib/state/useUnsavedChangesGuard';
import { KeyValueEditorDialog } from '../ui/KeyValueEditorDialog';
import { PromptDialog } from '../ui/PromptDialog';
import { RequestBodyTab } from './RequestBodyTab';
import { RequestAuthTab } from './RequestAuthTab';
import { RequestHeadersTab } from './RequestHeadersTab';
import { RequestParamsTab } from './RequestParamsTab';
import { RequestSettingsTab } from './RequestSettingsTab';
import { RequestTopBar } from './RequestTopBar';
import { UrlEditorDialog } from './UrlEditorDialog';
import {
  findDuplicateKeyIndexes,
  findMissingKeyIndexes,
  validateRequestForSubmit,
} from '../../lib/forms/requestValidation';
import { jsonTextToKeyValueRows, keyValueRowsToJsonText } from '../../lib/body/transformers';
import { detectPastedContent } from '../../lib/paste/autoDetect';
import { buildUrlWithParams, decodeUrlForEditor, encodeUrlForRequest, parseQueryParamsFromUrl, prettyFormatUrlQuery } from '../../lib/forms/requestUrl';
import { buildEnvironmentVariableContext, buildVariableTemplateSuggestions, findUnresolvedVariables } from '../../lib/variables/engine';
import {
  deleteRequestTemplate,
  getRequestTemplate,
  listRequestTemplates,
  saveRequestTemplate,
  type RequestTemplate,
} from '../../lib/templates/requestTemplates';
import { getRequestPresetById, REQUEST_PRESETS } from '../../lib/presets/requestPresets';
import { BODY_SNIPPETS, getBodySnippetById } from '../../lib/snippets/requestSnippets';
import {
  areQueryRowsEqual,
  buildRequestFromForm,
  deriveAuthFromHeaders,
  prepareRequestForSend,
  toHeadersArray,
  type FormValues,
} from './requestEditorModel';

const MAX_HISTORY_BODY_CHARS = 120_000;
const MAX_AUTOSAVE_BODY_CHARS = 80_000;
const AUTOSAVE_DELAY_MS = 1200;
const LARGE_BODY_AUTOSAVE_DELAY_MS = 2500;

export const RequestEditor = () => {
  const { activeRequestId, runningByRequest, setRequestRunning, setResult, setSentRequest, setRequestSelectionGuard, setRequestDirty } =
    useActiveRequestStore();
  const activeRequest = useActiveRequestFromCollection(activeRequestId);
  const { mutateAsync: saveRequest, isPending: isSaving } = useSaveRequestMutation();
  const { mutateAsync: saveLastResult } = useSaveLastResultMutation();
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'params' | 'auth' | 'settings'>('body');
  const [showUrlEditor, setShowUrlEditor] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlDraftDirty, setUrlDraftDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [transformNotice, setTransformNotice] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [selectedBodySnippetId, setSelectedBodySnippetId] = useState('');
  const [templateNamePromptOpen, setTemplateNamePromptOpen] = useState(false);
  const { isLocked, openModal } = useWorkspaceLockStore();
  const byRequestRevisions = useRequestRevisionStore((s) => s.byRequest);
  const initRequestHistory = useRequestRevisionStore((s) => s.initRequestHistory);
  const captureSnapshot = useRequestRevisionStore((s) => s.captureSnapshot);
  const undoRevision = useRequestRevisionStore((s) => s.undo);
  const redoRevision = useRequestRevisionStore((s) => s.redo);
  const clearRequestHistory = useRequestRevisionStore((s) => s.clearRequestHistory);
  const [, setIsEditingUrl] = useState(false);
  const applyingRevisionRef = useRef(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const { confirmDiscard } = useUnsavedChangesGuard();
  const [paramEditor, setParamEditor] = useState<{
    index: number;
    key: string;
    value: string;
  } | null>(null);
  useHotkeys([
    { combo: 'mod+s', handler: () => void handleSave() },
    { combo: 'mod+enter', handler: () => void handleRun() },
    { combo: 'mod+l', handler: () => urlInputRef.current?.focus() },
    { combo: 'mod+z', handler: () => void handleUndo() },
    { combo: 'mod+shift+z', handler: () => void handleRedo() },
  ]);

  const {
    control,
    register,
    reset,
    watch,
    setValue,
    getValues,
    formState,
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
  const queryParams = watch('query_params');
  const headersRows = watch('headers');
  const formBodyRows = watch('form_body');
  const authType = watch('auth_type');
  const authParams = watch('auth_params');
  const secretBody = watch('secret_body');
  const secretAuthParams = watch('secret_auth_params');
  const bodyValue = watch('body');
  const autoSaveSnapshot = useWatch({ control });
  const isDirty = formState.isDirty;
  const { data: environmentData } = useEnvironmentQuery();

  const queryClient = useQueryClient();
  const headerDuplicateIndexes = useMemo(() => findDuplicateKeyIndexes(headersRows || []), [headersRows]);
  const headerMissingKeyIndexes = useMemo(() => findMissingKeyIndexes(headersRows || []), [headersRows]);
  const queryDuplicateIndexes = useMemo(() => findDuplicateKeyIndexes(queryParams || []), [queryParams]);
  const queryMissingKeyIndexes = useMemo(() => findMissingKeyIndexes(queryParams || []), [queryParams]);
  const formDuplicateIndexes = useMemo(() => findDuplicateKeyIndexes(formBodyRows || []), [formBodyRows]);
  const formMissingKeyIndexes = useMemo(() => findMissingKeyIndexes(formBodyRows || []), [formBodyRows]);
  const activeCollectionId = useActiveCollectionStore((s) => s.activeId);

  const { fields: ruleFields, append: appendRule, remove: removeRule } = useFieldArray({
    control,
    name: 'extract_rules',
  });

  const syncQueryParamsFromUrl = useCallback(
    (url: unknown, shouldDirty: boolean) => {
      const nextUrl = decodeUrlForEditor(url);
      const currentUrl = getValues('url') || '';
      if (nextUrl !== currentUrl) {
        setValue('url', nextUrl, { shouldDirty });
      }
      const parsed = parseQueryParamsFromUrl(nextUrl);
      const current = getValues('query_params') || [];
      if (areQueryRowsEqual(parsed, current)) return;
      setValue('query_params', parsed, { shouldDirty });
    },
    [getValues, setValue],
  );

  const applyQueryParams = useCallback(
    (rows: Array<{ key: string; value?: string; enabled?: boolean; secret?: boolean }>, shouldDirty = true) => {
      const normalizedRows = rows.map((r) => ({ ...r, value: r.value ?? '' }));
      setValue('query_params', normalizedRows, { shouldDirty });
      const currentUrl = getValues('url') || '';
      const nextUrl = buildUrlWithParams(currentUrl, normalizedRows);
      if (nextUrl !== currentUrl) {
        setValue('url', nextUrl, { shouldDirty });
      }
    },
    [getValues, setValue],
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
    const initialValues: FormValues = {
      name: activeRequest.name,
      method: activeRequest.method,
      url: decodeUrlForEditor(typeof activeRequest.url === 'string' ? activeRequest.url : ''),
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
    };
    reset(initialValues);
    if ((initialValues.body || '').length <= MAX_HISTORY_BODY_CHARS) {
      initRequestHistory(activeRequest.id, initialValues);
    } else {
      clearRequestHistory(activeRequest.id);
    }
    setSaveState('saved');
    setTransformNotice(null);
  }, [activeRequest, reset, initRequestHistory, clearRequestHistory]);

  const buildRequest = useMemo(() => {
    if (!activeRequest) return null;
    return (values: FormValues): HttpRequest => buildRequestFromForm(activeRequest, values);
  }, [activeRequest]);

  const performSave = useCallback(
    async (mode: 'manual' | 'auto') => {
      if (!activeRequest || !activeCollectionId || isLocked || !buildRequest) return;
      if (mode === 'auto' && isSaving) return;
      const values = getValues();
      const updated = buildRequest(values);
      try {
        setSaveState('saving');
        await saveRequest(updated);
        reset(values);
        setSaveState('saved');
      } catch (err) {
        console.error(err);
        setSaveState('error');
      }
    },
    [activeCollectionId, activeRequest, buildRequest, getValues, isLocked, isSaving, reset, saveRequest],
  );

  const handleSave = async () => {
    if (!activeRequest || !activeCollectionId) return;
    const issues = validateRequestForSubmit({
      url: getValues('url'),
      body_mode: getValues('body_mode'),
      headers: getValues('headers') || [],
      query_params: getValues('query_params') || [],
      form_body: getValues('form_body') || [],
      binary: getValues('binary'),
    });
    if (issues.length) {
      const first = issues[0];
      setValidationError(first.message);
      setActiveTab(first.tab);
      if (first.selector) {
        window.setTimeout(() => {
          const node = document.querySelector<HTMLElement>(first.selector!);
          node?.focus();
        }, 0);
      }
      return;
    }
    setValidationError(null);
    await performSave('manual');
  };

  const handleRun = async () => {
    if (isLocked) {
      return;
    }
    if (!activeRequest || !activeCollectionId) return;
    const issues = validateRequestForSubmit({
      url: getValues('url'),
      body_mode: getValues('body_mode'),
      headers: getValues('headers') || [],
      query_params: getValues('query_params') || [],
      form_body: getValues('form_body') || [],
      binary: getValues('binary'),
    });
    if (issues.length) {
      const first = issues[0];
      setValidationError(first.message);
      setActiveTab(first.tab);
      if (first.selector) {
        window.setTimeout(() => {
          const node = document.querySelector<HTMLElement>(first.selector!);
          node?.focus();
        }, 0);
      }
      return;
    }
    setValidationError(null);
    if (!buildRequest) return;
    const baseReq = buildRequest(getValues());
    const prepared = prepareRequestForSend(baseReq);
    setSentRequest(prepared.id, prepared);
    setRequestRunning(prepared.id, true);
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
      setRequestRunning(prepared.id, false);
    }
  };

  const openUrlEditor = useCallback(() => {
    const rawUrl = getValues('url');
    const safeUrl = typeof rawUrl === 'string' ? rawUrl : rawUrl == null ? '' : String(rawUrl);
    setUrlDraft(safeUrl);
    setUrlDraftDirty(false);
    setShowUrlEditor(true);
    setIsEditingUrl(true);
  }, [getValues]);

  const closeUrlEditor = useCallback(() => {
    const shouldClose = confirmDiscard({
      isDirty: urlDraftDirty,
      message: 'Discard unsaved URL changes?',
    });
    if (!shouldClose) return;
    setShowUrlEditor(false);
    setIsEditingUrl(false);
    setUrlDraftDirty(false);
  }, [confirmDiscard, urlDraftDirty]);

  const saveAndCloseUrlEditor = useCallback(() => {
    const nextUrl = decodeUrlForEditor(urlDraft.trim());
    const rawCurrent = getValues('url');
    const currentUrl = typeof rawCurrent === 'string' ? rawCurrent : rawCurrent == null ? '' : String(rawCurrent);
    setValue('url', nextUrl, { shouldDirty: nextUrl !== currentUrl });
    syncQueryParamsFromUrl(nextUrl, false);
    setShowUrlEditor(false);
    setIsEditingUrl(false);
    setUrlDraftDirty(false);
  }, [getValues, setValue, syncQueryParamsFromUrl, urlDraft]);

  const decodeUrlDraftForEdit = useCallback(() => {
    const next = decodeUrlForEditor(urlDraft);
    setUrlDraft(next);
    setUrlDraftDirty(true);
  }, [urlDraft]);

  const prettyFormatUrlDraft = useCallback(() => {
    const next = prettyFormatUrlQuery(urlDraft);
    setUrlDraft(next);
    setUrlDraftDirty(true);
  }, [urlDraft]);

  useEffect(() => {
    setSaveState((prev) => (isDirty ? (prev === 'saving' ? prev : 'unsaved') : 'saved'));
  }, [isDirty]);

  useEffect(() => {
    if (!activeRequestId) return;
    setRequestDirty(activeRequestId, isDirty);
  }, [activeRequestId, isDirty, setRequestDirty]);

  useEffect(() => {
    if (validationError) setValidationError(null);
  }, [autoSaveSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTemplates(listRequestTemplates());
  }, []);

  useEffect(() => {
    if (!activeRequestId || applyingRevisionRef.current) return;
    const timer = window.setTimeout(() => {
      const snapshot = getValues();
      if ((snapshot.body || '').length > MAX_HISTORY_BODY_CHARS) return;
      captureSnapshot(activeRequestId, snapshot);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeRequestId, autoSaveSnapshot, captureSnapshot, getValues]);

  useEffect(() => {
    if (!activeRequest || !activeCollectionId || isLocked || !isDirty) return;
    const hasLargeBody = (bodyValue || '').length > MAX_AUTOSAVE_BODY_CHARS;
    const timer = window.setTimeout(() => {
      void performSave('auto');
    }, hasLargeBody ? LARGE_BODY_AUTOSAVE_DELAY_MS : AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeCollectionId, activeRequest, autoSaveSnapshot, bodyValue, isDirty, isLocked, performSave]);

  useEffect(() => {
    setRequestSelectionGuard((nextId) => {
      const shouldSwitch = confirmDiscard({
        isDirty,
        message: 'You have unsaved request changes. Discard and switch requests?',
      });
      if (shouldSwitch && activeRequestId && nextId !== activeRequestId) {
        setRequestDirty(activeRequestId, false);
      }
      return shouldSwitch;
    });
    return () => setRequestSelectionGuard(null);
  }, [activeRequestId, confirmDiscard, isDirty, setRequestDirty, setRequestSelectionGuard]);

  const bodyMode = watch('body_mode');
  const binary = watch('binary');
  const urlValue = watch('url');
  const activeRevisionState = activeRequestId ? byRequestRevisions[activeRequestId] : undefined;
  const canUndo = Boolean(activeRevisionState && activeRevisionState.index > 0);
  const canRedo = Boolean(activeRevisionState && activeRevisionState.index < activeRevisionState.entries.length - 1);
  const activeRequestRunning = activeRequestId ? Boolean(runningByRequest[activeRequestId]) : false;
  const methodField = register('method');
  const urlField = register('url');
  const activeEnvVars = useMemo(() => {
    if (!environmentData) return {};
    const key = environmentData.active_env;
    return environmentData.envs?.[key]?.variables || {};
  }, [environmentData]);
  const variableContext = useMemo(() => buildEnvironmentVariableContext(activeEnvVars), [activeEnvVars]);
  const variableSuggestions = useMemo(
    () => buildVariableTemplateSuggestions(Object.keys(activeEnvVars || {})),
    [activeEnvVars],
  );
  const urlUnresolvedVariables = useMemo(
    () => findUnresolvedVariables(urlValue, variableContext).sort(),
    [urlValue, variableContext],
  );
  const headerUnresolvedKeyIndexes = useMemo(() => {
    const set = new Set<number>();
    (headersRows || []).forEach((row, idx) => {
      if (findUnresolvedVariables(row.key, variableContext).length) set.add(idx);
    });
    return set;
  }, [headersRows, variableContext]);
  const headerUnresolvedValueIndexes = useMemo(() => {
    const set = new Set<number>();
    (headersRows || []).forEach((row, idx) => {
      if (findUnresolvedVariables(row.value, variableContext).length) set.add(idx);
    });
    return set;
  }, [headersRows, variableContext]);
  const queryUnresolvedKeyIndexes = useMemo(() => {
    const set = new Set<number>();
    (queryParams || []).forEach((row, idx) => {
      if (findUnresolvedVariables(row.key, variableContext).length) set.add(idx);
    });
    return set;
  }, [queryParams, variableContext]);
  const queryUnresolvedValueIndexes = useMemo(() => {
    const set = new Set<number>();
    (queryParams || []).forEach((row, idx) => {
      if (findUnresolvedVariables(row.value, variableContext).length) set.add(idx);
    });
    return set;
  }, [queryParams, variableContext]);
  const formUnresolvedKeyIndexes = useMemo(() => {
    const set = new Set<number>();
    (formBodyRows || []).forEach((row, idx) => {
      if (findUnresolvedVariables(row.key, variableContext).length) set.add(idx);
    });
    return set;
  }, [formBodyRows, variableContext]);
  const formUnresolvedValueIndexes = useMemo(() => {
    const set = new Set<number>();
    (formBodyRows || []).forEach((row, idx) => {
      if (findUnresolvedVariables(row.value, variableContext).length) set.add(idx);
    });
    return set;
  }, [formBodyRows, variableContext]);
  const encodedUrlPreview = useMemo(() => encodeUrlForRequest(urlDraft || urlValue || ''), [urlDraft, urlValue]);
  const unresolvedVariableNames = useMemo(() => {
    const names = new Set<string>();
    const add = (value: unknown) => {
      findUnresolvedVariables(value, variableContext).forEach((name) => names.add(name));
    };
    add(urlValue);
    add(bodyValue);
    (headersRows || []).forEach((row) => {
      add(row.key);
      add(row.value);
    });
    (queryParams || []).forEach((row) => {
      add(row.key);
      add(row.value);
    });
    Object.values(authParams || {}).forEach((value) => add(value));
    return Array.from(names).sort();
  }, [authParams, bodyValue, headersRows, queryParams, urlValue, variableContext]);
  const unresolvedVariableCount = unresolvedVariableNames.length;

  const handleConvertBodyToTable = useCallback(() => {
    const source = String(getValues('body') || '');
    const { rows, warning } = jsonTextToKeyValueRows(source);
    if (!rows.length) {
      setTransformNotice(warning || 'Unable to convert this body to table rows.');
      return;
    }
    setValue(
      'form_body',
      rows.map((row) => ({ ...row, type: 'text' })),
      { shouldDirty: true },
    );
    setValue('body_mode', 'form-urlencoded', { shouldDirty: true });
    setTransformNotice(warning || `Converted ${rows.length} field(s) to table rows.`);
  }, [getValues, setValue]);

  const handleConvertTableToBody = useCallback(() => {
    const rows = getValues('form_body') || [];
    const text = keyValueRowsToJsonText(rows.map((row) => ({ key: row.key, value: row.value ?? '', enabled: row.enabled })));
    setValue('body', text, { shouldDirty: true });
    setValue('body_mode', 'json', { shouldDirty: true });
    setTransformNotice('Converted table rows to JSON body.');
  }, [getValues, setValue]);

  const handleSmartPaste = useCallback(async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const detection = detectPastedContent(raw);
      if (!detection.normalized.trim()) {
        setTransformNotice('Clipboard is empty.');
        return;
      }
      if (detection.kind === 'json') {
        const { rows } = jsonTextToKeyValueRows(detection.normalized);
        setValue('body', detection.normalized, { shouldDirty: true });
        setValue('body_mode', 'json', { shouldDirty: true });
        if (rows.length) {
          setValue(
            'form_body',
            rows.map((row) => ({ ...row, type: 'text' })),
            { shouldDirty: true },
          );
        }
        setTransformNotice('Detected JSON and applied to body. Table conversion is ready.');
        return;
      }
      if (detection.kind === 'urlencoded') {
        const params = new URLSearchParams(detection.normalized);
        const rows = Array.from(params.entries()).map(([key, value]) => ({
          key,
          value,
          enabled: true,
          type: 'text' as const,
        }));
        setValue('form_body', rows.length ? rows : [{ key: '', value: '', enabled: true, type: 'text' }], { shouldDirty: true });
        setValue('body_mode', 'form-urlencoded', { shouldDirty: true });
        setTransformNotice('Detected URL-encoded body and converted to table rows.');
        return;
      }
      const mode = detection.kind === 'text' ? 'raw' : 'raw';
      setValue('body', detection.normalized, { shouldDirty: true });
      setValue('body_mode', mode, { shouldDirty: true });
      setTransformNotice(`Detected ${detection.kind} and pasted as raw body.`);
    } catch (err) {
      console.error(err);
      setTransformNotice('Clipboard read failed. Allow clipboard permission and try again.');
    }
  }, [setValue]);

  const handleBodyModeChange = useCallback(
    (nextMode: FormValues['body_mode']) => {
      const currentMode = getValues('body_mode');
      if ((nextMode === 'form-urlencoded' || nextMode === 'form-data') && (currentMode === 'json' || currentMode === 'raw')) {
        const { rows, warning } = jsonTextToKeyValueRows(String(getValues('body') || ''));
        if (rows.length) {
          setValue(
            'form_body',
            rows.map((row) => ({ ...row, type: 'text' })),
            { shouldDirty: true },
          );
          if (warning) setTransformNotice(warning);
        }
      }
      if (nextMode === 'json' && (currentMode === 'form-urlencoded' || currentMode === 'form-data')) {
        const rows = getValues('form_body') || [];
        if ((getValues('body') || '').trim().length === 0 && rows.length) {
          setValue(
            'body',
            keyValueRowsToJsonText(rows.map((row) => ({ key: row.key, value: row.value ?? '', enabled: row.enabled }))),
            { shouldDirty: true },
          );
          setTransformNotice('Converted table rows to JSON when switching modes.');
        }
      }
      setValue('body_mode', nextMode, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  const handleSaveTemplate = useCallback(
    (name: string) => {
      const values = getValues();
      const saved = saveRequestTemplate(name, {
        method: values.method,
        url: values.url,
        body: values.body,
        body_mode: values.body_mode,
        headers: values.headers || [],
        query_params: values.query_params || [],
        form_body: values.form_body || [],
        auth_type: values.auth_type,
        auth_params: values.auth_params || {},
      });
      const next = listRequestTemplates();
      setTemplates(next);
      setSelectedTemplateId(saved.id);
      setTemplateNamePromptOpen(false);
      setTransformNotice(`Saved template "${saved.name}".`);
    },
    [getValues],
  );

  const handleApplyTemplate = useCallback(() => {
    if (!selectedTemplateId) return;
    const template = getRequestTemplate(selectedTemplateId);
    if (!template) return;
    const payload = template.payload;
    setValue('method', payload.method, { shouldDirty: true });
    setValue('url', decodeUrlForEditor(payload.url), { shouldDirty: true });
    setValue('body', payload.body, { shouldDirty: true });
    setValue('body_mode', payload.body_mode, { shouldDirty: true });
    setValue('headers', payload.headers as any, { shouldDirty: true });
    setValue('query_params', payload.query_params as any, { shouldDirty: true });
    setValue('form_body', payload.form_body as any, { shouldDirty: true });
    setValue('auth_type', payload.auth_type, { shouldDirty: true });
    setValue('auth_params', payload.auth_params || {}, { shouldDirty: true });
    if (!payload.query_params?.length) {
      syncQueryParamsFromUrl(payload.url, true);
    }
    setTransformNotice(`Applied template "${template.name}".`);
  }, [selectedTemplateId, setValue, syncQueryParamsFromUrl]);

  const handleDeleteTemplate = useCallback(() => {
    if (!selectedTemplateId) return;
    deleteRequestTemplate(selectedTemplateId);
    setTemplates(listRequestTemplates());
    setSelectedTemplateId('');
    setTransformNotice('Template deleted.');
  }, [selectedTemplateId]);

  const handleApplyPreset = useCallback(() => {
    if (!selectedPresetId) return;
    const preset = getRequestPresetById(selectedPresetId);
    if (!preset) return;
    const current = getValues();
    const next = preset.apply({
      headers: current.headers || [],
      auth_type: current.auth_type,
      auth_params: current.auth_params || {},
      body_mode: current.body_mode,
      body: current.body || '',
    });
    if (next.headers) setValue('headers', next.headers as any, { shouldDirty: true });
    if (next.auth_type) setValue('auth_type', next.auth_type, { shouldDirty: true });
    if (next.auth_params) setValue('auth_params', next.auth_params, { shouldDirty: true });
    if (next.body_mode) setValue('body_mode', next.body_mode, { shouldDirty: true });
    if (next.body !== undefined) setValue('body', next.body, { shouldDirty: true });
    setTransformNotice(`Applied preset "${preset.label}".`);
  }, [getValues, selectedPresetId, setValue]);

  const handleApplyBodySnippet = useCallback(() => {
    if (!selectedBodySnippetId) return;
    const snippet = getBodySnippetById(selectedBodySnippetId);
    if (!snippet) return;
    const current = getValues('body') || '';
    const combined = current.trim().length ? `${current}\n${snippet.text}` : snippet.text;
    setValue('body', combined, { shouldDirty: true });
    setValue('body_mode', snippet.mode, { shouldDirty: true });
    setTransformNotice(`Inserted snippet "${snippet.label}".`);
  }, [getValues, selectedBodySnippetId, setValue]);

  const applyRevisionSnapshot = useCallback(
    (snapshot: FormValues, notice: string) => {
      if (!activeRequestId) return;
      applyingRevisionRef.current = true;
      reset(snapshot);
      setRequestDirty(activeRequestId, true);
      setSaveState('unsaved');
      setTransformNotice(notice);
      window.setTimeout(() => {
        applyingRevisionRef.current = false;
      }, 0);
    },
    [activeRequestId, reset, setRequestDirty],
  );

  const handleUndo = useCallback(() => {
    if (!activeRequestId) return;
    const snapshot = undoRevision(activeRequestId);
    if (!snapshot) return;
    applyRevisionSnapshot(snapshot, 'Undo applied.');
  }, [activeRequestId, applyRevisionSnapshot, undoRevision]);

  const handleRedo = useCallback(() => {
    if (!activeRequestId) return;
    const snapshot = redoRevision(activeRequestId);
    if (!snapshot) return;
    applyRevisionSnapshot(snapshot, 'Redo applied.');
  }, [activeRequestId, applyRevisionSnapshot, redoRevision]);

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
      <RequestTopBar
        methodField={methodField}
        urlField={urlField}
        urlInputRef={urlInputRef}
        saveState={saveState}
        isSaving={isSaving}
        isLocked={isLocked}
        activeRequestRunning={activeRequestRunning}
        canUndo={canUndo}
        canRedo={canRedo}
        unresolvedVariableCount={unresolvedVariableCount}
        unresolvedVariableNames={unresolvedVariableNames}
        urlUnresolvedVariables={urlUnresolvedVariables}
        variableSuggestions={variableSuggestions}
        onOpenUrlEditor={openUrlEditor}
        onUrlFocus={() => setIsEditingUrl(true)}
        onUrlBlur={(value) => {
          setIsEditingUrl(false);
          syncQueryParamsFromUrl(value, false);
        }}
        onRun={() => void handleRun()}
        onSave={() => void handleSave()}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
      />
      {validationError && (
        <div className="px-4 py-2 text-xs bg-destructive/10 text-destructive border-b border-destructive/30">
          {validationError}
        </div>
      )}
      <UrlEditorDialog
        open={showUrlEditor}
        urlDraft={urlDraft}
        encodedPreview={encodedUrlPreview}
        variableSuggestions={variableSuggestions}
        onDraftChange={(next) => {
          setUrlDraft(next);
          setUrlDraftDirty(true);
        }}
        onDecode={decodeUrlDraftForEdit}
        onPrettyQuery={prettyFormatUrlDraft}
        onClose={closeUrlEditor}
        onSave={saveAndCloseUrlEditor}
      />

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
          <RequestBodyTab
            bodyMode={bodyMode}
            bodyValue={bodyValue}
            secretBody={secretBody}
            binary={binary}
            formBodyRows={watch('form_body')}
            formUnresolvedKeyIndexes={formUnresolvedKeyIndexes}
            formUnresolvedValueIndexes={formUnresolvedValueIndexes}
            variableSuggestions={variableSuggestions}
            bodySnippets={BODY_SNIPPETS.map((s) => ({ id: s.id, label: s.label }))}
            selectedSnippetId={selectedBodySnippetId}
            unresolvedVariableCount={unresolvedVariableCount}
            unresolvedVariableNames={unresolvedVariableNames}
            transformNotice={transformNotice}
            isLocked={isLocked}
            formDuplicateIndexes={formDuplicateIndexes}
            formMissingIndexes={formMissingKeyIndexes}
            onBodyModeChange={handleBodyModeChange}
            onBodyChange={(value) => setValue('body', value, { shouldDirty: true })}
            onSmartPaste={() => void handleSmartPaste()}
            onConvertBodyToTable={handleConvertBodyToTable}
            onConvertTableToBody={handleConvertTableToBody}
            onSnippetSelect={setSelectedBodySnippetId}
            onApplySnippet={handleApplyBodySnippet}
            onSecretBodyToggle={() => setValue('secret_body', !secretBody, { shouldDirty: true })}
            onFormBodyChange={(rows) => setValue('form_body', rows, { shouldDirty: true })}
            onBinaryChange={(next) => setValue('binary', next, { shouldDirty: true })}
          />
        )}
        {activeTab === 'headers' && (
          <RequestHeadersTab
            control={control}
            onHeadersChange={(headers) => setValue('headers', headers, { shouldDirty: true })}
            duplicateKeyIndexes={headerDuplicateIndexes}
            missingKeyIndexes={headerMissingKeyIndexes}
            unresolvedKeyIndexes={headerUnresolvedKeyIndexes}
            unresolvedValueIndexes={headerUnresolvedValueIndexes}
            variableSuggestions={variableSuggestions}
          />
        )}
        {activeTab === 'params' && (
          <RequestParamsTab
            rows={queryParams || []}
            onChange={(rows) => applyQueryParams(rows, true)}
            onEditRow={(idx) => {
              const row = (queryParams || [])[idx];
              if (!row) return;
              setParamEditor({ index: idx, key: row.key || '', value: row.value || '' });
            }}
            duplicateKeyIndexes={queryDuplicateIndexes}
            missingKeyIndexes={queryMissingKeyIndexes}
            unresolvedKeyIndexes={queryUnresolvedKeyIndexes}
            unresolvedValueIndexes={queryUnresolvedValueIndexes}
            variableSuggestions={variableSuggestions}
          />
        )}
        {activeTab === 'auth' && (
          <RequestAuthTab
            authType={authType}
            authParams={authParams || {}}
            secretAuthParams={secretAuthParams || {}}
            onAuthTypeChange={(next) => setValue('auth_type', next, { shouldDirty: true })}
            onAuthParamsChange={(next) => setValue('auth_params', next, { shouldDirty: true })}
            onSecretAuthParamsChange={(next) => setValue('secret_auth_params', next, { shouldDirty: true })}
          />
        )}
        {activeTab === 'settings' && (
          <RequestSettingsTab
            ruleFields={ruleFields}
            register={register}
            appendRule={appendRule}
            removeRule={removeRule}
            templateOptions={templates.map((tpl) => ({ id: tpl.id, name: tpl.name }))}
            selectedTemplateId={selectedTemplateId}
            presetOptions={REQUEST_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
            selectedPresetId={selectedPresetId}
            onTemplateSelect={setSelectedTemplateId}
            onApplyTemplate={handleApplyTemplate}
            onSaveTemplate={() => setTemplateNamePromptOpen(true)}
            onDeleteTemplate={handleDeleteTemplate}
            onPresetSelect={setSelectedPresetId}
            onApplyPreset={handleApplyPreset}
          />
        )}
      </div>

      <KeyValueEditorDialog
        open={Boolean(paramEditor)}
        title="Edit Query Parameter"
        subtitle={paramEditor ? `Index #${paramEditor.index + 1}` : undefined}
        keyValue={paramEditor?.key || ''}
        valueValue={paramEditor?.value || ''}
        onKeyChange={(value) =>
          setParamEditor((prev) => (prev ? { ...prev, key: value } : prev))
        }
        onValueChange={(value) =>
          setParamEditor((prev) => (prev ? { ...prev, value } : prev))
        }
        onCancel={() => setParamEditor(null)}
        onSave={() => {
          if (!paramEditor) return;
          const rows = [...(queryParams || [])];
          rows[paramEditor.index] = {
            ...(rows[paramEditor.index] || { enabled: true }),
            key: paramEditor.key,
            value: paramEditor.value,
          };
          applyQueryParams(rows, true);
          setParamEditor(null);
        }}
      />
      <PromptDialog
        open={templateNamePromptOpen}
        title="Save Request Template"
        message="Template name"
        placeholder="e.g. OAuth Token Request"
        defaultValue={getValues('name') || 'New Template'}
        confirmLabel="Save Template"
        onConfirm={handleSaveTemplate}
        onCancel={() => setTemplateNamePromptOpen(false)}
      />
    </div>
  );
};
