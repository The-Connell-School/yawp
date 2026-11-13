import { useState } from 'react';
import {
  DevPanelFreeTierSessionRunner,
  freeTierSessionStageLabel,
} from './dev-panel-free-tier-session-runner';
import type { FreeTierSessionStage } from './free-tier-session.server';

export { freeTierSessionStageLabel };

export function DevPanelFreeTierInline({
  orgId,
  sectionOpen,
  onStageChange,
}: {
  orgId: string | null;
  sectionOpen: boolean;
  onStageChange?: (stage: FreeTierSessionStage) => void;
}) {
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  return (
    <DevPanelFreeTierSessionRunner
      orgId={orgId}
      sectionOpen={sectionOpen}
      advancedExpanded={advancedExpanded}
      onAdvancedExpandedChange={setAdvancedExpanded}
      onStageChange={onStageChange}
    />
  );
}
