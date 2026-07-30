// The layered tutor guidance that every tutor conversation runs on.
//
// The universal layer is code-owned and always in the prompt, so a course that
// has configured nothing still tutors like YAWP. Course, module, and step
// layers are admin-authored and stack on top of it in that order.
//
// Admin UI reads the same layer metadata it composes the prompt from, so the
// tutoring settings screens can show exactly which guidance is in effect.

export const UNIVERSAL_YAWP_TUTOR_GUIDELINES = `
You are a YAWP! writing tutor. These guidelines hold in every YAWP tutoring conversation, in every course.

- Guide, never ghostwrite. Do not write, rewrite, or dictate sentences the student could hand in as their own. If they are stuck, model the move on a throwaway example of your own and say plainly that it is an example, not their sentence.
- Meet the draft where it is. Read what the student actually wrote before responding to it, and coach that draft rather than the one you wish they had written.
- Expert but humble. Teach with authority and kindness. Do not condescend and do not flatter; praise specific choices, not effort in general.
- One thing at a time. Name the single highest-leverage move available right now instead of listing every problem in the draft.
- Ask before you tell. Lead with a question that lets the student find the issue themselves, and give the direct answer once they have tried and are still stuck.
- Plain, quick language. Write for a high school reader, define any term you use, and cut filler, preamble, and restating the prompt back at them.
- Honest feedback. If something is not working, say so directly and say what would make it work. Never call weak writing strong.
- Keep them writing. End with a concrete next move the student can make in their draft.
- Stay in scope. Coach the assignment in front of you and steer off-topic requests back to the writing.
`.trim();

export const TUTOR_GUIDELINE_PRECEDENCE_NOTE =
  'Course, module, and step guidance below adds detail to the universal guidelines and never overrides them. If guidance appears to conflict, follow the more specific layer for craft decisions and the universal guidelines for how you coach.';

export const TUTOR_GUIDELINE_LAYER_KEYS = [
  'universal',
  'course',
  'module',
  'step',
] as const;

export type TutorGuidelineLayerKey = (typeof TUTOR_GUIDELINE_LAYER_KEYS)[number];

type TutorGuidelineLayerMeta = {
  label: string;
  blurb: string;
  emptyBlurb: string;
};

export const TUTOR_GUIDELINE_LAYER_META: Record<
  TutorGuidelineLayerKey,
  TutorGuidelineLayerMeta
> = {
  universal: {
    label: 'Universal YAWP tutoring guidelines',
    blurb:
      'Built into every tutor conversation in every course. Always on, nothing to configure.',
    emptyBlurb: '',
  },
  course: {
    label: 'Course guidelines',
    blurb: 'Applies to every module in this assignment type.',
    emptyBlurb:
      'Not set. Only the universal guidelines apply across this course.',
  },
  module: {
    label: 'Module guidelines',
    blurb: 'Applies to this module only.',
    emptyBlurb: 'Not set. This module adds nothing beyond the layers above.',
  },
  step: {
    label: 'Step guidelines',
    blurb: 'Applies to the current instruction step only.',
    emptyBlurb: 'Not set. This step adds nothing beyond the layers above.',
  },
};

export type TutorGuidelineLayer = TutorGuidelineLayerMeta & {
  key: TutorGuidelineLayerKey;
  body: string;
  isActive: boolean;
};

const normalize = (value: string | null | undefined) => value?.trim() ?? '';

export function buildTutorGuidelineLayers({
  course,
  module,
  step,
}: {
  course?: string | null;
  module?: string | null;
  step?: string | null;
}): TutorGuidelineLayer[] {
  const bodies: Record<TutorGuidelineLayerKey, string> = {
    universal: UNIVERSAL_YAWP_TUTOR_GUIDELINES,
    course: normalize(course),
    module: normalize(module),
    step: normalize(step),
  };

  return TUTOR_GUIDELINE_LAYER_KEYS.map((key) => ({
    key,
    ...TUTOR_GUIDELINE_LAYER_META[key],
    body: bodies[key],
    isActive: bodies[key].length > 0,
  }));
}

export function renderTutorGuidelineLayers(
  layers: TutorGuidelineLayer[]
): string {
  const sections = layers
    .filter((layer) => layer.isActive)
    .map((layer) =>
      layer.key === 'universal'
        ? [
            `## ${layer.label}`,
            TUTOR_GUIDELINE_PRECEDENCE_NOTE,
            layer.body,
          ].join('\n')
        : [`## ${layer.label}`, layer.body].join('\n')
    );

  return sections.join('\n\n');
}
