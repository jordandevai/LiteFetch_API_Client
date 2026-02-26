import { useRef } from 'react';

type SyncOrigin = 'left' | 'right' | null;

export const useBiDirectionalSync = () => {
  const originRef = useRef<SyncOrigin>(null);

  const markFromLeft = () => {
    originRef.current = 'left';
  };

  const markFromRight = () => {
    originRef.current = 'right';
  };

  const consumeIfFromLeft = () => {
    if (originRef.current !== 'left') return false;
    originRef.current = null;
    return true;
  };

  const consumeIfFromRight = () => {
    if (originRef.current !== 'right') return false;
    originRef.current = null;
    return true;
  };

  const resetSyncOrigin = () => {
    originRef.current = null;
  };

  return {
    markFromLeft,
    markFromRight,
    consumeIfFromLeft,
    consumeIfFromRight,
    resetSyncOrigin,
  };
};
