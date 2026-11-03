import { useEffect } from 'react';

export function useDevPanelShortcut(onToggle: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.code !== 'KeyD') return;
      if (!event.altKey || !event.shiftKey) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onToggle]);
}
