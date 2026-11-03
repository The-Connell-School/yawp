import { useCallback, useEffect, useRef, useState } from 'react';
import { useBeforeUnload } from 'react-router';

const INTERACTIVE_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';

/**
 * Browser-native "Leave site?" when card-page forms have typed but unsent input.
 */
export function useCardPageUnsavedFormGuard(
  contentRef: React.RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [dirty, setDirty] = useState(false);
  const allowUnloadRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setDirty(false);
      allowUnloadRef.current = false;
      return;
    }

    const root = contentRef.current;
    if (!root) return;

    allowUnloadRef.current = false;
    setDirty(false);

    const markDirty = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.matches(INTERACTIVE_SELECTOR)) return;
      if (!target.closest('form')) return;
      setDirty(true);
    };

    const onSubmit = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      if (!root.contains(event.target)) return;
      allowUnloadRef.current = true;
      setDirty(false);
    };

    root.addEventListener('input', markDirty, true);
    root.addEventListener('change', markDirty, true);
    root.addEventListener('submit', onSubmit, true);

    return () => {
      root.removeEventListener('input', markDirty, true);
      root.removeEventListener('change', markDirty, true);
      root.removeEventListener('submit', onSubmit, true);
    };
  }, [contentRef, enabled]);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!enabled || !dirty || allowUnloadRef.current) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [dirty, enabled]
    )
  );

  return { dirty, allowUnloadRef };
}
