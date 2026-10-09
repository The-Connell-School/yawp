import { AssignmentPromptAttachment } from '~/components/assignments/assignment-prompt-attachment';
import type { AssignmentPrompt } from './document-editor/document-editor';

/**
 * The assignment prompt as the left-hand panel.
 *
 * With the tutor switched off that column used to disappear, dropping the
 * editor into a full-width page and pushing the prompt into a banner over the
 * document. The prompt takes the column instead: same place, same width, and
 * the writing surface keeps the shape it has when the tutor is on.
 *
 * A tutor-off assignment is a cold write, and the panel says so, so a student
 * knows the missing tutor is the teacher's choice rather than a fault.
 */
export function AssignmentPromptPanel({
  assignment,
}: {
  assignment?: AssignmentPrompt | null;
}) {
  const prompt = assignment?.prompt?.trim();
  if (!prompt) return null;

  return (
    <div
      className="flex w-full flex-col border-r bg-amber-50 pb-2 md:w-3/5"
      data-testid="assignment-prompt-side-panel"
    >
      <div className="flex items-center justify-between gap-8 border-b py-1 pl-4 pr-2">
        <div className="flex h-[32px] w-full min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">
            Assignment prompt
          </span>
          <span className="min-w-0 truncate text-sm font-bold text-foreground/80">
            {assignment?.title?.trim() || 'Untitled Assignment'}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pl-4 pr-4 pt-3">
        <p className="mb-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Cold write.</span>{' '}
          There is no tutor on this one — write it on your own.
        </p>
        <div className="whitespace-pre-wrap text-sm text-foreground/90">
          {prompt}
        </div>
        {assignment?.promptAttachmentName ? (
          <div className="mt-3">
            <AssignmentPromptAttachment
              assignmentId={assignment.id}
              fileName={assignment.promptAttachmentName}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
