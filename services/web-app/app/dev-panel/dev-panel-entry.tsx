import { DevPanelMount as DevPanelMountImpl } from './dev-panel-mount';
import type { DevPanelEnvBadge } from './dev-panel-types';

type DevPanelMountProps = {
  envBadge: DevPanelEnvBadge;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
};

export function DevPanelMount(props: DevPanelMountProps) {
  if (typeof __YAWP_DEV_PANEL_BUILD__ === 'undefined' || !__YAWP_DEV_PANEL_BUILD__) {
    return null;
  }
  // Eager import (no React.lazy/Suspense): a hydrating Suspense sibling was
  // receiving Outlet updates from document routes and tripping React’s hydration
  // pageerror in Playwright. Production swaps this module for a stub via Vite.
  return <DevPanelMountImpl {...props} />;
}