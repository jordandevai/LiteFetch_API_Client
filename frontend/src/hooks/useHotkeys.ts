import { useEffect } from 'react';

export const useHotkeys = (keys: { combo: string; handler: (e: KeyboardEvent) => void }[]) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = [
        e.metaKey || e.ctrlKey ? 'mod' : null,
        e.shiftKey ? 'shift' : null,
        e.altKey ? 'alt' : null,
        e.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join('+');
      keys.forEach((k) => {
        if (k.combo === combo) {
          e.preventDefault();
          k.handler(e);
        }
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys]);
};
