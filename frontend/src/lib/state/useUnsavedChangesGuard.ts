import { useCallback } from 'react';

type GuardOptions = {
  isDirty: boolean;
  message?: string;
};

type ConfirmFn = (message: string) => boolean;

const defaultConfirm: ConfirmFn = (message) => {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
};

export const useUnsavedChangesGuard = (confirmFn: ConfirmFn = defaultConfirm) => {
  const confirmDiscard = useCallback(
    ({ isDirty, message = 'Discard unsaved changes?' }: GuardOptions) => {
      if (!isDirty) return true;
      return confirmFn(message);
    },
    [confirmFn],
  );

  return { confirmDiscard };
};
