import { AlertTriangle } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { cn } from '~/utils/misc';

const TEACHER_NOTE_PREFIX_PATTERN =
  /^(?:private\s+)?(?:teacher\s+)?(?:note|notes|context|observation|observations)\s*:\s*/i;
const TEACHER_NOTE_PRIVACY_PATTERN =
  /(?:^|\s*;?\s*)(?:use\s+this\s+only\s+as\s+teacher\s+context|teacher\s+context\s+only|internal\s+only|for\s+teacher\s+use\s+only)\.?$/i;

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
  note,
  variant = 'footer',
}: {
  note: string | null;
  variant?: 'footer' | 'inline';
}) {
  if (!note?.trim()) return null;
  const items = formatTeacherNoteItems(note);
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
          Only shown to teachers
        </Badge>
      </div>
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
    </section>
  );
}
