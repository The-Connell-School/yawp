import {
  isCaptionResource,
  isTranscriptResource,
} from '~/utils/teacher-training-media-accessibility';

/**
 * The teaching materials behind a standalone writing step: the lesson plan,
 * slide deck, and tutorial video a teacher uses before assigning it.
 *
 * They live in the Teacher's Lounge course today, so the assignment type page
 * links to those same files rather than keeping its own copies. When the
 * materials move onto the type pages for good, only the lookup changes.
 */
export const LESSON_MATERIALS_COURSE_TITLE = 'The Thesis-Driven Essay';

/**
 * Assignment type kind -> a stable phrase from the matching course lesson's
 * title ("Lesson 2: Pre-writing"). Matched by phrase, not ID, so the link holds
 * across environments and survives a retitle that keeps the phrase.
 */
const LESSON_MODULE_PHRASES: Record<string, string> = {
  prewriting: 'Pre-writing',
  thesis_statement: 'Developing a Thesis Statement',
};

export function lessonModulePhraseForKind(
  kind: string | null | undefined
): string | null {
  return (kind && LESSON_MODULE_PHRASES[kind]) || null;
}

export type LessonMaterialKind =
  | 'lesson-plan'
  | 'slide-deck'
  | 'video'
  | 'handout';

export type LessonMaterial = {
  kind: LessonMaterialKind;
  label: string;
  href: string;
};

type LessonResource = { id: string; name: string; contentType: string };

function isLessonPlan(resource: LessonResource) {
  return /lesson plan/i.test(resource.name);
}

function isSlideDeck(resource: LessonResource) {
  const name = resource.name.trim().toLowerCase();
  const contentType = resource.contentType.trim().toLowerCase();
  return (
    /\.(pptx?|key|odp)$/.test(name) ||
    /presentation|powerpoint/.test(contentType) ||
    name.includes('slide deck')
  );
}

function withoutExtension(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

function resourceHref(resource: LessonResource) {
  return `/api/teacher-training-module-resource/${resource.id}`;
}

/**
 * The materials to show, in the order a teacher reaches for them: the plan,
 * the deck, the video, then any handouts. Captions and transcripts back the
 * video and are not something a teacher puts in front of a class.
 */
export function lessonMaterialsFor({
  trainingId,
  moduleId,
  hasVideo,
  resources,
}: {
  trainingId: string;
  moduleId: string;
  hasVideo: boolean;
  resources: LessonResource[];
}): LessonMaterial[] {
  const teachable = resources.filter(
    (resource) => !isCaptionResource(resource) && !isTranscriptResource(resource)
  );
  const plans = teachable.filter(isLessonPlan);
  const decks = teachable.filter(
    (resource) => !isLessonPlan(resource) && isSlideDeck(resource)
  );
  const handouts = teachable.filter(
    (resource) => !plans.includes(resource) && !decks.includes(resource)
  );

  return [
    ...plans.map((resource) => ({
      kind: 'lesson-plan' as const,
      label: 'Lesson plan',
      href: resourceHref(resource),
    })),
    ...decks.map((resource) => ({
      kind: 'slide-deck' as const,
      label: 'Slide deck',
      href: resourceHref(resource),
    })),
    ...(hasVideo
      ? [
          {
            kind: 'video' as const,
            label: 'Tutorial video',
            href: `/app/teacher-trainings/${trainingId}/modules/${moduleId}`,
          },
        ]
      : []),
    ...handouts.map((resource) => ({
      kind: 'handout' as const,
      label: withoutExtension(resource.name),
      href: resourceHref(resource),
    })),
  ];
}
