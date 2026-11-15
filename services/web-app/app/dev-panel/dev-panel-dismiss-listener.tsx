import { useEffect } from 'react';
import { useDevPanel } from './dev-panel-provider';

export const DEV_PANEL_DISMISS_EVENT = 'yawp:dismiss-dev-panel';

/** Lets non-descendant routes (sibling of DevPanelMount in root) close the panel before opening their own sheets. */
export function DevPanelDismissListener() {
  const { closePanel } = useDevPanel();

  useEffect(() => {
    const onDismiss = () => closePanel();
    window.addEventListener(DEV_PANEL_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(DEV_PANEL_DISMISS_EVENT, onDismiss);
  }, [closePanel]);

  return null;
}