import { useEffect } from 'react';
import { DEV_PANEL_DISMISS_EVENT } from '~/utils/dev-panel-dismiss-event';
import { clearRadixScrollLockCleanup } from '~/utils/radix-scroll-lock-cleanup';
import { useDevPanel } from './dev-panel-provider';

/** Lets non-descendant routes (sibling of DevPanelMount in root) close the panel before opening their own sheets. */
export function DevPanelDismissListener() {
  const { closePanel } = useDevPanel();

  useEffect(() => {
    const onDismiss = () => {
      closePanel();
      clearRadixScrollLockCleanup();
    };
    window.addEventListener(DEV_PANEL_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(DEV_PANEL_DISMISS_EVENT, onDismiss);
  }, [closePanel]);

  return null;
}