export function TeacherNotes({ note }: { note: string | null }) {
  if (!note?.trim()) return null;
  return (
    <section aria-label="Notes to the teacher" className="max-h-48 shrink-0 overflow-y-auto border-t px-4 py-3" data-testid="teacher-private-notes">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">Notes to the teacher</h2>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{note}</p>
    </section>
  );
}
