import { DevPanelBeaker } from './dev-panel-beaker';
import { DevPanelProvider, useDevPanel } from './dev-panel-provider';
import { DevPanelShell } from './dev-panel-shell';
import { DevPanelShellBoundary } from './dev-panel-shell-boundary';
import { useDevPanelShortcut } from './use-dev-panel-shortcut';
import type { DevPanelEnvBadge } from './dev-panel-types';
import './dev-panel.css';

function DevPanelShortcutBridge() {
  const { togglePanel } = useDevPanel();
  useDevPanelShortcut(togglePanel, true);
  return null;
}

function DevPanelShellWithBoundary() {
  const { state } = useDevPanel();
  return (
    <DevPanelShellBoundary open={state.open}>
      <DevPanelShell />
    </DevPanelShellBoundary>
  );
}

export function DevPanelMount({
  envBadge,
  previewAccessGateEnabled,
  previewAccessSeatLabel,
}: {
  envBadge: DevPanelEnvBadge;
  previewAccessGateEnabled: boolean;
  previewAccessSeatLabel: string | null;
}) {
  return (
    <DevPanelProvider
      envBadge={envBadge}
      previewAccessGateEnabled={previewAccessGateEnabled}
      previewAccessSeatLabel={previewAccessSeatLabel}
    >
      <DevPanelShortcutBridge />
      <DevPanelBeaker />
      <DevPanelShellWithBoundary />
    </DevPanelProvider>
  );
}
