import { create } from 'zustand';
import { LiteAPI } from '../lib/api';

type LockState = {
  isLocked: boolean;
  legacyMode: boolean;
  hasVault: boolean;
  hasCiphertext: boolean;
  setStatus: (locked: boolean, legacy: boolean, hasVault?: boolean, ciphertext?: boolean) => void;
  setUnlocked: (passphrase: string) => Promise<boolean>;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

export const useWorkspaceLockStore = create<LockState>((set) => ({
  isLocked: false,
  legacyMode: false,
  hasVault: true,
  hasCiphertext: false,
  modalOpen: true,
  setStatus: (locked, legacy, hasVault, ciphertext) =>
    set((prev) => ({
      isLocked: locked || !!ciphertext,
      legacyMode: legacy,
      hasVault: hasVault ?? prev.hasVault,
      hasCiphertext: ciphertext ?? prev.hasCiphertext,
      modalOpen: prev.modalOpen || locked || legacy || !!ciphertext || !(hasVault ?? prev.hasVault),
    })),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
  setUnlocked: async (passphrase: string) => {
    if (!passphrase.trim()) return false;
    const res = await LiteAPI.unlockWorkspace(passphrase.trim());
    set({ isLocked: false, legacyMode: false, hasVault: true, hasCiphertext: false, modalOpen: false });
    return res.status === 'unlocked';
  },
}));
