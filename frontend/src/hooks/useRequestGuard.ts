import { useWorkspaceLockStore } from '../stores/useWorkspaceLockStore';

export const useRequestGuard = () => {
  const { isLocked, setStatus } = useWorkspaceLockStore();

  const ensureUnlocked = () => {
    if (isLocked) return false;
    return true;
  };

  const triggerLockModal = () => {
    setStatus(true, false);
  };

  return { locked: isLocked, ensureUnlocked, triggerLockModal };
};
