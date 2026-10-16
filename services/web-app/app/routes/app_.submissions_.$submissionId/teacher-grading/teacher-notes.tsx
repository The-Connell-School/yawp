import { AlertTriangle } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { cn } from '~/utils/misc';
import type { TeacherNotesUiState } from '~/domain/grading/teacher-notes';

const TEACHER_NOTE_PREFIX_PATTERN =
  /^(?:private\s+)?(?:teacher\s+)?(?:note|notes|context|observation|observations)\s*:\s*/i;
const TEACHER_NOTE_PRIVACY_PATTERN =
  /(?:^|\s*;?\s*)(?:use\s+this\s+only\s+as\s+teacher\s+context|teacher\s+context\s+only|internal\s+only|for\s+teacher\s+use\s+only)\.?$/i;

const PENDING_MESSAGE =
  'Teacher notes will appear here after the Grading Assistant runs.';
const EMPTY_MESSAGE =
  'No notes for you on this one. Nothing in the writing stood out as inconsistent.';

function formatTeacherNoteItems(note: string): string[] {
  const cleaned = note
    .trim()
    .replace(TEACHER_NOTE_PREFIX_PATTERN, '')
    .replace(TEACHER_NOTE_PRIVACY_PATTERN, '')
    .trim();

  const explicitItems = cleaned
    .split(/\n+/)
    .map(item => item.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);

  if (explicitItems.length > 1) return explicitItems;

  const sentenceItems = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(item => item.trim())
    .filter(Boolean);

  return sentenceItems.length > 1 ? sentenceItems : [cleaned];
}

export function TeacherNotes({
  ui,
  variant = 'footer',
}: {
  ui: TeacherNotesUiState;
  variant?: 'footer' | 'inline';
}) {
  if (!ui.visible) return null;

  const body =
    ui.phase === 'pending'
      ? PENDING_MESSAGE
      : ui.phase === 'empty'
        ? EMPTY_MESSAGE
        : null;
  const items = ui.phase === 'content' ? formatTeacherNoteItems(ui.note) : null;

  return (
    <section
      aria-label="Teacher Context"
      className={cn(
        'max-h-48 shrink-0 overflow-y-auto text-sm',
        variant === 'footer' ? 'border-t px-4 py-3' : 'mx-4 mb-4'
      )}
      data-testid="teacher-private-notes"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Teacher Context
        </h2>
        <Badge
          variant="warning-soft"
          size="sm"
          className="gap-1 border-amber-200 bg-amber-50 py-0.5 pr-2 pl-1 text-amber-800 hover:bg-amber-50 hover:text-amber-800"
        >
          <AlertTriangle className="size-3" aria-hidden="true" />
          Not visible to students
        </Badge>
      </div>
      {body ? (
        <p className="mt-2 text-pretty text-foreground">{body}</p>
      ) : null}
      {items ? (
        <ul className="mt-2 space-y-1.5 text-foreground">
          {items.map((item, index) => (
            <li className="flex gap-2" key={`${item}-${index}`}>
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
              />
              <span className="text-pretty">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
