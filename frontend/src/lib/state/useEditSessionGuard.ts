import { useCallback, useRef } from 'react';

export const useEditSessionGuard = (cooldownMs = 750) => {
  const lastEditAtRef = useRef(0);

  const markUserEdit = useCallback(() => {
    lastEditAtRef.current = Date.now();
  }, []);

  const canHydrate = useCallback(() => Date.now() - lastEditAtRef.current > cooldownMs, [cooldownMs]);

  return { markUserEdit, canHydrate };
};
