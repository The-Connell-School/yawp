import type { DevPanelEnvBadge } from './dev-panel-types';

type DevPanelMountProps = {
  envBadge: DevPanelEnvBadge;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
};

/** Production build stub: no client dev-panel modules are loaded. */
export function DevPanelMount(_props: DevPanelMountProps) {
  return null;
}
