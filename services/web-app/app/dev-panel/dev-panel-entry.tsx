import { lazy, Suspense } from 'react';
import { useAfterHydration } from '~/utils/schedule-after-hydration';
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
  const interactive = useAfterHydration();
  if (typeof __YAWP_DEV_PANEL_BUILD__ === 'undefined' || !__YAWP_DEV_PANEL_BUILD__) {
    return null;
  }
  // Defer the lazy/Suspense subtree until the document shell finishes hydrating;
  // otherwise sibling route updates (e.g. document editor v2) abort DevPanel hydration.
  if (!interactive) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevPanelMount {...props} />
    </Suspense>
  );
}
