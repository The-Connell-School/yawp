import { FlaskConical, Lock } from 'lucide-react';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';

export function DevPanelBeaker() {
  const { state, openPanel, unlocked, previewAccessGateEnabled } = useDevPanel();
  if (state.open) return null;
  const locked = previewAccessGateEnabled && !unlocked;
  const label = locked
    ? 'Developer tools · locked · Alt+Shift+D'
    : 'Developer tools · Alt+Shift+D';
  return (
    <div className="local-dev-environment-control yawp-dev-panel-beaker fixed bottom-4 right-4 z-30">
      <button
        type="button"
        className={cn(
          'relative rounded-full bg-slate-900 p-2.5 text-white shadow-lg ring-1 ring-black/10',
          'transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label={locked ? 'Open developer tools (locked)' : 'Open developer tools'}
        title={label}
        aria-expanded={false}
        aria-controls="devtools"
        aria-keyshortcuts="Alt+Shift+D"
        onClick={openPanel}
      >
        <FlaskConical size={20} aria-hidden="true" />
        {locked ? (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-slate-900 ring-2 ring-[hsl(var(--background))]"
            aria-hidden="true"
          >
            <Lock className="size-2.5 text-white" strokeWidth={2.5} />
          </span>
        ) : null}
      </button>
    </div>
  );
}
