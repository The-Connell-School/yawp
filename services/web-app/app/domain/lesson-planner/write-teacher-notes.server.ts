/**
 * The first teacher notes for a lesson (Oct 24 handoff, task 7): one model
 * call writes notes for every step, from each step's own text, in labeled
 * sections. They are stored and are the teacher's to edit; a failed call
 * leaves the step's text as its notes.
 */
import { z } from 'zod';
import { MAX_NOTES, NOTE_SECTIONS } from './teacher-notes';

export const TEACHER_NOTES_SYSTEM = [
  'You write a teacher’s notes for each step of their lesson, for them to glance at on a laptop while they teach.',
  'Return JSON only: {"steps": [{"notes": string}]}, exactly one entry per numbered step, in the same order.',
  `- Each "notes" is a few short labeled sections, one per line, each starting with its label and a colon, from these, in this order: ${NOTE_SECTIONS.join(', ')}. Use the ones the step needs, usually three to five.`,
  '- Written to the teacher ("Ask them…", "Listen for…"), concrete, from the step’s own text: the question to ask with the answer to listen for, the line that connects back to the reading, the sign it is time to move on.',
  '- Plain, warm, teacher-to-teacher language. Never write a library prompt id. Write the product name as Yawp!.',
].join('\n');

const REPLY = z.object({ steps: z.array(z.object({ notes: z.string().trim().min(1).max(MAX_NOTES) })) });

function readJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function writeTeacherNotes({
  title,
  className,
  steps,
  complete,
}: {
  title: string;
  className: string | null;
  steps: Array<{ id: string; title: string; minutes: number | null; content: string }>;
  /** One model call: the user message in, the reply out. */
  complete: (user: string) => Promise<string>;
}): Promise<Record<string, string> | null> {
  if (!steps.length) return null;
  const user = [
    `Lesson: ${title}`,
    className ? `Class: ${className}` : null,
    '',
    'Steps, in order:',
    ...steps.map((step, index) =>
      [`${index + 1}. ${step.title}${step.minutes !== null ? ` (${step.minutes} min)` : ''}`, `   ${step.content.slice(0, 1200)}`].join('\n')
    ),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  try {
    const parsed = REPLY.safeParse(readJson(await complete(user)));
    if (!parsed.success || parsed.data.steps.length !== steps.length) return null;
    return Object.fromEntries(steps.map((step, index) => [step.id, parsed.data.steps[index]!.notes]));
  } catch {
    return null;
  }
}
