import { ChevronRight, Lock } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useDevPanel } from './dev-panel-provider';

/** Shown when the unlocked panel tree throws — keeps the beaker path usable. */
export function DevPanelFallbackShell() {
  const { closePanel, envBadge } = useDevPanel();

  return (
    <aside
      id="devtools"
      data-yawp-dev-panel
      data-yawp-dev-panel-ready="true"
      aria-label="Developer tools"
      className="yawp-dev-panel-docked fixed inset-y-0 right-0 z-40 flex w-[var(--yawp-dev-panel-width)] flex-col border-l bg-background shadow-xl"
    >
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">Developer tools</p>
          <p className="text-xs text-muted-foreground">{envBadge}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close developer tools"
          onClick={closePanel}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="flex flex-1 flex-col items-center px-4 py-8 text-center">
        <div
          className="mb-4 flex size-12 items-center justify-center rounded-full border bg-muted/30"
          aria-hidden="true"
        >
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <p className="font-medium">Developer tools are locked</p>
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          Something went wrong loading the panel. Close and open developer tools again, or
          re-enter your access code.
        </p>
      </div>
    </aside>
  );
}
