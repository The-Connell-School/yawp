/**
 * Lesson templates (stack page redesign): a teacher's lesson shape, saved
 * from a set lesson and started from on the planner. The order and timing,
 * never the content: the planner fills each slot for the new topic, and the
 * teacher still picks.
 */
import { z } from 'zod';
import { stackTiming } from './stack-timing';
import { STEP_TYPE_LABELS, STEP_TYPES, type StepType } from './step-types';

export const TEMPLATE_SLOT = z.object({
  type: z.enum(STEP_TYPES),
  minutes: z.number().int().min(1).max(120),
  label: z.string().max(60).nullish(),
  isWriting: z.boolean().optional(),
});
export type TemplateSlot = z.infer<typeof TEMPLATE_SLOT>;
export const TEMPLATE_SLOTS = z.array(TEMPLATE_SLOT).min(1).max(30);

export type LessonTemplate = {
  id: string;
  name: string;
  slots: TemplateSlot[];
  periodMinutes: number | null;
};

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
