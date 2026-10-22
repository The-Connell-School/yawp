import { FlaskConical } from 'lucide-react';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';

export function DevPanelBeaker() {
  const { state, openPanel } = useDevPanel();
  if (state.open) return null;
  return (
    <div className="local-dev-environment-control yawp-dev-panel-beaker fixed bottom-4 right-4 z-30">
      <button
        type="button"
        className={cn(
          'rounded-full bg-slate-900 p-2.5 text-white shadow-lg ring-1 ring-black/10',
          'transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label="Open developer tools"
        title="Developer tools (Alt+Shift+D)"
        aria-expanded={false}
        aria-controls="devtools"
        aria-keyshortcuts="Alt+Shift+D"
        onClick={openPanel}
      >
        <FlaskConical size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
