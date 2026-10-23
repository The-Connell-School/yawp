/**
 * Lesson templates (stack page redesign): a teacher's lesson shape, saved
 * from a set lesson and started from on the planner. The order and timing,
 * never the content: the planner fills each slot for the new topic, and the
 * teacher still picks.
 */
import { z } from 'zod';
import { stackTiming } from './stack-timing';
import { DEFAULT_STEP_MINUTES, STEP_TYPE_LABELS, STEP_TYPES, type StepType } from './step-types';
import type { WeekFramework } from './plan-days';

export const TEMPLATE_SLOT = z.object({
  type: z.enum(STEP_TYPES),
  minutes: z.number().int().min(1).max(120),
  label: z.string().max(60).nullish(),
  isWriting: z.boolean().optional(),
});
export type TemplateSlot = z.infer<typeof TEMPLATE_SLOT>;
export const TEMPLATE_SLOTS = z.array(TEMPLATE_SLOT).min(1).max(30);

/** A week's framework (Brian's run 5, round 2): one entry per day. */
export const TEMPLATE_DAYS = z
  .array(z.object({ day: z.number().int().min(1).max(60), title: z.string().min(1).max(120), slots: TEMPLATE_SLOTS }))
  .min(2)
  .max(30);
export type TemplateDay = z.infer<typeof TEMPLATE_DAYS>[number];

export type LessonTemplate = {
  id: string;
  name: string;
  slots: TemplateSlot[];
  periodMinutes: number | null;
  /** Set for a week's framework; a one-lesson template has none. */
  days?: TemplateDay[] | null;
};

/** A week's days as template days: each step's type and minutes, never its words. */
export function templateDaysFromFramework(framework: WeekFramework): TemplateDay[] {
  return framework.days.flatMap((day) => {
    const slots = day.steps.map((step) => {
      const type = step.type ?? 'activity';
      return { type, minutes: step.minutes ?? DEFAULT_STEP_MINUTES[type], label: step.title.slice(0, 60) };
    });
    return slots.length ? [{ day: day.day, title: day.title.slice(0, 120), slots }] : [];
  });
}

/** "Day 1 Lecture · Day 2 Close reading · …" */
export function frameworkShape(days: TemplateDay[]): string {
  return days.map((day) => `Day ${day.day} ${day.title}`).join(' · ');
}

export function slotsFromSteps(
  steps: Array<{ type: StepType; minutes: number; label?: string | null; isWriting: boolean }>
): TemplateSlot[] {
  return steps.map((step) => ({
    type: step.type,
    minutes: step.minutes,
    label: step.label ?? null,
    isWriting: step.isWriting,
  }));
}

/** "Class Starter → Context → Read aloud → Daily Pages → Closing" */
export function templateShape(slots: TemplateSlot[]): string {
  const names: string[] = [];
  for (const slot of slots) {
    const name = STEP_TYPE_LABELS[slot.type];
    if (names.at(-1) !== name) names.push(name);
  }
  return names.join(' → ');
}

export function templateTiming(template: Pick<LessonTemplate, 'slots' | 'periodMinutes'>) {
  return stackTiming(
    template.slots.map((slot, index) => ({
      id: String(index),
      title: STEP_TYPE_LABELS[slot.type],
      type: slot.type,
      minutes: slot.minutes,
      isWriting: Boolean(slot.isWriting),
    })),
    template.periodMinutes
  );
}

/** What the planner hears when a lesson starts from a template (P6). */
export function buildTemplateSection(template: LessonTemplate | null): string[] {
  if (!template) return [];
  if (template.days?.length) {
    return [
      '',
      `The teacher is planning from their ${template.days.length}-day framework "${template.name}". Keep its shape: these days, in this order, each with these steps and minutes, for the new text or week.`,
      ...template.days.flatMap((day) => [
        `Day ${day.day}: ${day.title}`,
        ...day.slots.map((slot) => `  - ${slot.label || STEP_TYPE_LABELS[slot.type]} (${STEP_TYPE_LABELS[slot.type]}), ${slot.minutes} min`),
      ]),
      '- Write the whole week in one reply: a `# Day N: title (minutes)` heading for each day, its steps as `##` headings with their minutes and types. Yawp! makes each day its own lesson.',
      '- Do not ask how long the period is or what the structure is: the framework says.',
    ];
  }
  return [
    '',
    `The teacher is building this lesson from their template "${template.name}". Keep its shape: these slots, in this order, with these minutes.`,
    ...template.slots.map(
      (slot, index) =>
        `${index + 1}. ${STEP_TYPE_LABELS[slot.type]}${slot.label ? ` (${slot.label})` : ''}, ${slot.minutes} min`
    ),
    '- Fill each slot with a piece for this topic, as its own `##` step with its minutes and type. Offer one alternative for a slot only when the topic genuinely gives two good choices, never a list.',
    '- Do not ask how long the period is: the template says.',
  ];
}
