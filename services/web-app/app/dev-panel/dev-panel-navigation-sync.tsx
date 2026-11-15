import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useDevPanel } from './dev-panel-provider';
import { prepareAppShellForRadixSheet } from '~/utils/radix-scroll-lock-cleanup';

/**
 * Eager dev-panel mount + inline restore classes can leave `html.yawp-dev-panel-open`
 * set while the panel is closed, which shifts the app shell and can obscure later
 * Radix sheets (for example, exit-ticket edit). Keep layout classes in sync with
 * navigation and clear any stale body scroll lock from non-modal overlays.
 */
export function DevPanelNavigationSync() {
  const { state } = useDevPanel();
  const location = useLocation();

  useEffect(() => {
    if (!state.open) {
      document.documentElement.classList.remove(
        'yawp-dev-panel-open',
        'yawp-dev-panel-restored',
        'yawp-dev-panel-closing'
      );
    }
    prepareAppShellForRadixSheet();
  }, [location.pathname, location.search, state.open]);

  return null;
}