/**
 * The short summaries in a concise lesson plan (Brian's run 2, D1, item 29):
 * for each part of the lesson, what happens and what it is for, plus an
 * overview, goals and what the teacher will do. One model call per stack,
 * cached by the stack's key; any failure falls back to the plan's own first
 * sentences.
 */
import { z } from 'zod';
import type { LessonPlanStep, LessonPlanSummaries } from './lesson-plan-doc';

export const PLAN_SUMMARY_SYSTEM = [
  'You turn a teacher’s lesson stack into a concise lesson plan they will hand in or keep: one to three pages.',
  'Return JSON only, with exactly these keys:',
  '{"overview": string, "goals": string[], "teacherWill": string[], "steps": [{"title": string, "summary": string, "purpose": string, "optional": boolean}], "closing": string}',
  '- overview: two sentences on what the lesson does and where it sits in the reading.',
  '- goals: two to four, each "Students will …", concrete and checkable.',
  '- teacherWill: three to five short lines on what the teacher does.',
  '- steps: exactly one entry per numbered part, in the same order. "title" is a short, active step title, two to six words that say what happens ("Debunk the myth", "Celebrate the thesis"), with no minutes and no number; "summary" is one or two sentences on what happens, in the teacher\'s own voice, with the answer in parentheses after any question that has one; "purpose" is one sentence on why this part serves the lesson; "optional" is true only for a part the plan itself calls optional.',
  '- closing: one sentence on how the lesson ends.',
  '- Never reproduce the full text of a framing, prompt, handout or slide; summarize it. Never write a library prompt id (FW-021, sf-ev-03). Write the product name as Yawp!.',
  '- Plain, warm, teacher-to-teacher language. Offer, do not prescribe.',
].join('\n');

const SUMMARY = z.object({
  overview: z.string().min(1).max(600),
  goals: z.array(z.string().min(1).max(300)).min(1).max(6),
  teacherWill: z.array(z.string().min(1).max(300)).max(8),
  steps: z.array(
    z.object({
      summary: z.string().max(400),
      purpose: z.string().max(300),
      title: z.string().trim().max(60).optional().catch(undefined),
      optional: z.boolean().optional().catch(undefined),
    })
  ),
  closing: z.string().max(400),
});

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

export async function summarizeLessonPlan({
  title,
  className,
  periodMinutes,
  steps,
  complete,
}: {
  title: string;
  className: string | null;
  periodMinutes: number | null;
  /** The plan's own steps, with their first sentences as the material to work from. */
  steps: Array<Pick<LessonPlanStep, 'title' | 'minutes' | 'summary'> & { content?: string }>;
  /** One model call: the user message in, the reply out. */
  complete: (user: string) => Promise<string>;
}): Promise<LessonPlanSummaries | null> {
  if (!steps.length) return null;
  const user = [
    `Lesson: ${title}`,
    className ? `Class: ${className}` : null,
    periodMinutes ? `Length: ${periodMinutes} minutes` : null,
    '',
    'Parts, in order:',
    ...steps.map((step, index) =>
      [
        `${index + 1}. ${step.title}${step.minutes !== null ? ` (${step.minutes} min)` : ''}`,
        `   ${(step.content ?? step.summary).slice(0, 700)}`,
      ].join('\n')
    ),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  try {
    const parsed = SUMMARY.safeParse(readJson(await complete(user)));
    if (!parsed.success || parsed.data.steps.length !== steps.length) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
