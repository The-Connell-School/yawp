import { AssignmentPromptAttachment } from '~/components/assignments/assignment-prompt-attachment';
import type { AssignmentPrompt } from '../app_.documents_.$id/document-editor/document-editor';

/**
 * The assignment prompt column, sized for this page.
 *
 * Deliberately not the solo editor's `AssignmentPromptPanel`, even though it
 * looks the same. That one is `md:w-3/5` because it sits in a three-column
 * layout where comments squeeze it back; here there are only two columns, so
 * the same class gave the prompt 60% of the page and left the writing surface —
 * the part students actually use — as the smaller half.
 *
 * Editing the shared component would have changed the solo editor's layout,
 * which this feature must not touch, so the width is the one thing that differs.
 */
export function CollabPromptPanel({
  assignment,
}: {
  assignment?: AssignmentPrompt | null;
}) {
  const prompt = assignment?.prompt?.trim();
  if (!prompt) return null;

  return (
    <div
      className="flex w-full shrink-0 flex-col border-r bg-amber-50 pb-2 md:w-[340px] lg:w-[380px]"
      data-testid="collab-prompt-side-panel"
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
