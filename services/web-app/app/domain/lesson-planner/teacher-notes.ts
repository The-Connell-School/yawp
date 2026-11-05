/**
 * Teacher notes for the run of show (Oct 24 handoff, task 7): per step,
 * written to the teacher, in labeled sections ("Open with: …"). Stored on
 * the lesson as { [stepId]: text } and shown in full, never cut off.
 */

export const NOTE_SECTIONS = ['Open with', 'Say', 'Ask', 'Listen for', 'Connect back', 'Move on when'] as const;

export type NoteSection = { heading: string | null; body: string };

const HEADING = new RegExp(`^\\s*(${NOTE_SECTIONS.join('|')})\\s*:\\s*(.*)$`, 'i');

function canonical(heading: string): string {
  return NOTE_SECTIONS.find((name) => name.toLowerCase() === heading.toLowerCase()) ?? heading;
}

export function noteSections(text: string): NoteSection[] {
  const sections: NoteSection[] = [];
  for (const line of text.split('\n')) {
    const match = HEADING.exec(line);
    if (match) {
      sections.push({ heading: canonical(match[1]!), body: match[2]!.trim() });
    } else if (line.trim()) {
      const last = sections.at(-1);
      if (last) last.body = last.body ? `${last.body}\n${line.trim()}` : line.trim();
      else sections.push({ heading: null, body: line.trim() });
    }
  }
  return sections.filter((section) => section.body || section.heading);
}

export function readTeacherNotes(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''
    )
  );
}

/** Until the notes are written (or if writing them fails): the step's text. */
export function notesFallback(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function stepsWithoutNotes<T extends { id: string }>(steps: T[], notes: Record<string, string>): T[] {
  return steps.filter((step) => !notes[step.id]);
}

export const MAX_NOTES = 6000;
