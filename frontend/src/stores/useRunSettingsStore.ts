import { create } from 'zustand';

type FolderOverrides = Record<string, number>;

interface RunSettingsState {
  defaultConcurrency: number;
  folderOverrides: FolderOverrides;
  setDefaultConcurrency: (value: number) => void;
  setFolderConcurrency: (folderId: string, value: number | null) => void;
  getConcurrencyForFolder: (folderId: string) => number;
}

const SETTINGS_KEY = 'litefetch.runSettings.v1';
const ALLOWED = [1, 2, 4, 8, 16];

const clampConcurrency = (value: number) => {
  if (!Number.isFinite(value)) return 4;
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 16) return 16;
  return rounded;
};

const loadInitial = (): { defaultConcurrency: number; folderOverrides: FolderOverrides } => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { defaultConcurrency: 4, folderOverrides: {} };
    const parsed = JSON.parse(raw) as { defaultConcurrency?: number; folderOverrides?: FolderOverrides };
    return {
      defaultConcurrency: clampConcurrency(parsed.defaultConcurrency ?? 4),
      folderOverrides: parsed.folderOverrides || {},
    };
  } catch {
    return { defaultConcurrency: 4, folderOverrides: {} };
  }
};

const persist = (state: { defaultConcurrency: number; folderOverrides: FolderOverrides }) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage failures.
  }
};

const initial = loadInitial();

export const useRunSettingsStore = create<RunSettingsState>((set, get) => ({
  defaultConcurrency: initial.defaultConcurrency,
  folderOverrides: initial.folderOverrides,

  setDefaultConcurrency: (value) =>
    set((state) => {
      const normalized = ALLOWED.includes(value) ? value : clampConcurrency(value);
      const next = { ...state, defaultConcurrency: normalized };
      persist({ defaultConcurrency: next.defaultConcurrency, folderOverrides: next.folderOverrides });
      return next;
    }),

  setFolderConcurrency: (folderId, value) =>
    set((state) => {
      const nextOverrides = { ...state.folderOverrides };
      if (!value) delete nextOverrides[folderId];
      else nextOverrides[folderId] = ALLOWED.includes(value) ? value : clampConcurrency(value);
      persist({ defaultConcurrency: state.defaultConcurrency, folderOverrides: nextOverrides });
      return { ...state, folderOverrides: nextOverrides };
    }),

  getConcurrencyForFolder: (folderId) => {
    const state = get();
    return state.folderOverrides[folderId] || state.defaultConcurrency;
  },
}));
