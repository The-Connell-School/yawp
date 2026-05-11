import { EditorColumn } from './editor-column';
import { PromptBanner } from './prompt-banner';
import { SourcesColumn } from './sources-column';
import { SubmittedView } from './submitted-view';
import { TutorChatStripe } from './tutor-chat-stripe';
import { sampleDbq } from './sample-data';
import { useDbqState } from './use-dbq-state';

export function DbqAssignmentScreen() {
  const state = useDbqState(sampleDbq);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
        <TutorChatStripe state={state} />

        <div className="flex min-h-0 flex-col overflow-hidden">
          <PromptBanner state={state} />

          {state.view === 'drafting' ? (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-hidden p-3">
              <SourcesColumn state={state} />
              <EditorColumn state={state} />
            </div>
          ) : (
            <SubmittedView state={state} />
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground">
        Prototype — student drafting surface for the AP History essay
        AssignmentType. Stacked on PR #115. No persistence, no backend.
      </footer>
    </div>
  );
}
