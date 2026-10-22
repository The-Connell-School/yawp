import { lazy, Suspense } from 'react';
import type { DevPanelEnvBadge } from './dev-panel-types';

type DevPanelMountProps = {
  envBadge: DevPanelEnvBadge;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
};

const LazyDevPanelMount = lazy(() =>
  import('./dev-panel-mount').then((module) => ({
    default: module.DevPanelMount,
  }))
);

export function DevPanelMount(props: DevPanelMountProps) {
  if (typeof __YAWP_DEV_PANEL_BUILD__ === 'undefined' || !__YAWP_DEV_PANEL_BUILD__) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevPanelMount {...props} />
    </Suspense>
  );
}
