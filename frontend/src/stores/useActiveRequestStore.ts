import { create } from 'zustand';
import type { RequestResult } from '../lib/api';

interface ActiveRequestState {
  activeRequestId: string | null;
  result: RequestResult | null;
  isRunning: boolean;
  resultsByRequest: Record<string, RequestResult>;
  sentByRequest: Record<string, any>;

  setActiveRequestId: (id: string | null) => void;
  setResult: (res: RequestResult | null, requestId?: string) => void;
  setIsRunning: (val: boolean) => void;
  setSentRequest: (requestId: string, sent: any) => void;
}

export const useActiveRequestStore = create<ActiveRequestState>((set) => ({
  activeRequestId: null,
  result: null,
  isRunning: false,
  resultsByRequest: {},
  sentByRequest: {},

  setActiveRequestId: (id) =>
    set((state) => {
      if (!id) return { activeRequestId: null, result: null };
      const existing = state.resultsByRequest[id] || null;
      return { activeRequestId: id, result: existing };
    }),
  setResult: (res, requestId) =>
    set((state) => {
      const nextMap = { ...state.resultsByRequest };
      if (res && (requestId || res.request_id)) {
        nextMap[requestId || res.request_id] = res;
      }
      return { result: res, resultsByRequest: nextMap };
    }),
  setIsRunning: (val) => set({ isRunning: val }),
  setSentRequest: (requestId, sent) =>
    set((state) => ({
      sentByRequest: { ...state.sentByRequest, [requestId]: sent },
    })),
}));
