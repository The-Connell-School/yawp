import { ChevronsRight, FlaskConical, Lock } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useDevPanel } from './dev-panel-provider';

/** Shown when the unlocked panel tree throws — keeps the beaker path usable. */
export function DevPanelFallbackShell() {
  const { closePanel } = useDevPanel();

  return (
    <aside
      id="devtools"
      data-yawp-dev-panel
      data-yawp-dev-panel-ready="true"
      aria-label="Developer tools"
      className="yawp-dev-panel-docked fixed inset-y-0 right-0 z-40 flex w-[var(--yawp-dev-panel-width)] flex-col border-l bg-background"
    >
      <header className="yawp-dev-panel-header">
        <div className="yawp-dev-panel-header-title">
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          <p className="yawp-dev-panel-header-heading">Developer tools</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Close developer tools"
          onClick={closePanel}
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="flex flex-1 flex-col items-center px-4 py-8 text-center">
        <div
          className="mb-4 flex size-12 items-center justify-center rounded-full border bg-muted/30"
          aria-hidden="true"
        >
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <p className="font-medium">Developer tools couldn&apos;t load</p>
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          Close developer tools and try again, or re-enter your access code.
        </p>
      </div>
    </aside>
  );
}
