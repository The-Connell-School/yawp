import {
  startTransition,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import type { DevPanelEnvBadge } from './dev-panel-types';

type DevPanelMountProps = {
  envBadge: DevPanelEnvBadge;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
};

export function DevPanelMount(props: DevPanelMountProps) {
  const [MountImpl, setMountImpl] = useState<ComponentType<
    DevPanelMountProps
  > | null>(null);

  useEffect(() => {
    void import('./dev-panel-mount').then((module) => {
      startTransition(() => {
        setMountImpl(() => module.DevPanelMount);
      });
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