import { create } from 'zustand';
import { LiteAPI } from '../lib/api';

type LockState = {
  isLocked: boolean;
  legacyMode: boolean;
  hasVault: boolean;
  setStatus: (locked: boolean, legacy: boolean, hasVault?: boolean) => void;
  setUnlocked: (passphrase: string) => Promise<boolean>;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

export const useWorkspaceLockStore = create<LockState>((set) => ({
  isLocked: false,
  legacyMode: false,
  hasVault: true,
  modalOpen: true,
  setStatus: (locked, legacy, hasVault) =>
    set((prev) => ({
      isLocked: locked,
      legacyMode: legacy,
      hasVault: hasVault ?? prev.hasVault,
      modalOpen: prev.modalOpen || locked || legacy || !hasVault,
    })),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
  setUnlocked: async (passphrase: string) => {
    if (!passphrase.trim()) return false;
    const res = await LiteAPI.unlockWorkspace(passphrase.trim());
    set({ isLocked: false, legacyMode: false, hasVault: true, modalOpen: false });
    return res.status === 'unlocked';
  },
}));
