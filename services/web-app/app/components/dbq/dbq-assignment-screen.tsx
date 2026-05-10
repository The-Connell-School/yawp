import { ReadingMode } from './reading-mode';
import { SubmittedView } from './submitted-view';
import { TopBar } from './top-bar';
import { sampleDbq } from './sample-data';
import { useDbqState } from './use-dbq-state';
import { WritingMode } from './writing-mode';

export function DbqAssignmentScreen() {
  const state = useDbqState(sampleDbq);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <TopBar state={state} />
      <div className="flex min-h-0 flex-1 flex-col">
        {state.mode === 'reading' ? <ReadingMode state={state} /> : null}
        {state.mode === 'writing' ? <WritingMode state={state} /> : null}
        {state.mode === 'submitted' ? <SubmittedView state={state} /> : null}
      </div>
      <footer className="border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Prototype — student drafting surface for the AP History essay
        AssignmentType. Stacked on PR #115. No persistence, no backend.
      </footer>
    </div>
  );
}
