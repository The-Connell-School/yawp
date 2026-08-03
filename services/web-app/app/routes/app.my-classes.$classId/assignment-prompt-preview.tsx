import { useState } from 'react';
import { cn } from '~/utils/misc';

export const ASSIGNMENT_PROMPT_PREVIEW_MAX_CHARS = 180;

export function isAssignmentPromptTruncatable(prompt: string) {
  return prompt.trim().length > ASSIGNMENT_PROMPT_PREVIEW_MAX_CHARS;
}

export function AssignmentPromptPreview({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = prompt.trim();
  const truncatable = isAssignmentPromptTruncatable(trimmed);

  if (!trimmed) {
    return <span className="text-sm text-muted-foreground">No prompt</span>;
  }

  return (
    <div data-testid="assignment-prompt-preview">
      <p
        className={cn(
          'whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]',
          !expanded && truncatable && 'line-clamp-4'
        )}
      >
        {trimmed}
      </p>
      {truncatable ? (
        <button
          type="button"
          className="mt-1.5 text-sm font-medium text-primary hover:underline"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          data-testid="assignment-prompt-toggle"
        >
          {expanded ? 'Show less' : 'Show full prompt'}
        </button>
      ) : null}
    </div>
  );
}
