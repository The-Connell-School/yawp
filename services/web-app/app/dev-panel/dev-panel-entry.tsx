import { useEffect, useState, type ComponentType } from 'react';
import type { DevPanelEnvBadge } from './dev-panel-types';

type DevPanelMountProps = {
  envBadge: DevPanelEnvBadge;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
};

// Dynamic import avoids a hydrating React Suspense sibling of the document Outlet.
const devPanelMountChunkPromise =
  typeof __YAWP_DEV_PANEL_BUILD__ !== 'undefined' && __YAWP_DEV_PANEL_BUILD__
    ? import('./dev-panel-mount')
    : null;

export function DevPanelMount(props: DevPanelMountProps) {
  const [MountImpl, setMountImpl] = useState<ComponentType<
    DevPanelMountProps
  > | null>(null);

  useEffect(() => {
    if (!devPanelMountChunkPromise) return;
    void devPanelMountChunkPromise.then((module) => {
      setMountImpl(() => module.DevPanelMount);
    });
  }, []);

  if (typeof __YAWP_DEV_PANEL_BUILD__ === 'undefined' || !__YAWP_DEV_PANEL_BUILD__) {
    return null;
  }
  if (!MountImpl) {
    return null;
  }
  return <MountImpl {...props} />;
}