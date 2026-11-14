import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '~/components/ui/button';
import { AssignmentPromptAttachment } from '~/components/assignments/assignment-prompt-attachment';

const PROMPT_EXPANDED_MAX_HEIGHT = 'calc(50vh - 28px)';

export type AssignmentPrompt = {
  id: string;
  title: string | null;
  prompt: string | null;
  promptAttachmentName?: string | null;
  dueDate?: string | Date | null;
};

export function AssignmentPromptBanner({
  docId,
  assignment,
}: {
  docId: string;
  assignment?: AssignmentPrompt | null;
}) {
  const [isCollapsed, setIsCollapsed] = useLocalStorage(
    `assignmentPromptCollapsed-${docId}`,
    false
  );

  if (!assignment?.prompt?.trim()) return null;

  return (
    <div
      className="doc-editor-prompt-strip"
      data-testid="assignment-prompt-panel"
    >
      <span className="shrink-0 text-[13px] text-[hsl(50_2.4%_36%)]">
        Assignment prompt
      </span>
      <b className="shrink-0 text-[13px] text-[#1b1b1b]">
        {assignment.title?.trim() || 'Untitled Assignment'}
      </b>
      <span
        className="min-w-0 flex-1 truncate text-[13px] text-[hsl(48_20%_19.6078%)]"
        data-testid="assignment-prompt-header"
      >
        {isCollapsed ? assignment.prompt.trim().slice(0, 120) : assignment.prompt}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          isCollapsed ? 'Show full prompt' : 'Collapse assignment prompt'
        }
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((value) => !value)}
      >
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </Button>
      {!isCollapsed ? (
        <div className="w-full basis-full">
          <div
            className="overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[hsl(48_20%_19.6078%)]"
            style={{ maxHeight: PROMPT_EXPANDED_MAX_HEIGHT }}
          >
            {assignment.prompt}
          </div>
          {assignment.promptAttachmentName ? (
            <div className="mt-2">
              <AssignmentPromptAttachment
                assignmentId={assignment.id}
                fileName={assignment.promptAttachmentName}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}