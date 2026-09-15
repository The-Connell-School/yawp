import { cn } from '~/utils/misc';

export function TeacherNotes({
  note,
  variant = 'footer',
}: {
  note: string | null;
  variant?: 'footer' | 'inline';
}) {
  if (!note?.trim()) return null;
  return (
    <section
      aria-label="Notes to the teacher"
      className={cn(
        'max-h-48 shrink-0 overflow-y-auto px-4 py-3',
        variant === 'footer'
          ? 'border-t'
          : 'mx-4 mb-4 rounded-md border bg-muted/30'
      )}
      data-testid="teacher-private-notes"
    >
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Notes to the teacher
      </h2>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {note}
      </p>
    </section>
  );
}
