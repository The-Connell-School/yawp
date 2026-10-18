/**
 * Training videos on assignment pages (Brian, round 6; behind the
 * assignment_training_videos flag). The videos are leaving the Faculty
 * Lounge's Trainings for the assignment each one teaches.
 *
 * Nothing in the schema links a training module to an assignment step, so
 * they are matched the way the Thesis-Driven Essay decks are (#452): a
 * thesis course module "Lesson N: …" is lesson N, and a step is the lesson
 * whose deck lists its title. Lesson 1 (Day 1) has no step and goes before
 * the first one. Any other course matches a step by title, once the module's
 * "Lesson N:" prefix is set aside.
 */
import { deckForModuleTitle, deckForTrainingModule } from '~/domain/thesis-essay-decks/thesis-essay-decks';

export type TrainingVideoCandidate = {
  moduleId: string;
  courseId: string;
  courseTitle: string;
  moduleTitle: string;
};

export type TrainingVideoMatch<T extends TrainingVideoCandidate> = {
  dayOne: T | null;
  byStepId: Record<string, T>;
};

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*lesson\s+\d+\s*:/, '')
    .replace(/-/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchTrainingVideos<T extends TrainingVideoCandidate>(
  steps: Array<{ id: string; title: string }>,
  videos: T[]
): TrainingVideoMatch<T> {
  const result: TrainingVideoMatch<T> = { dayOne: null, byStepId: {} };
  for (const video of videos) {
    const deck = deckForTrainingModule(video.courseTitle, video.moduleTitle);
    if (deck?.lesson === 1) {
      result.dayOne ??= video;
      continue;
    }
    for (const step of steps) {
      if (result.byStepId[step.id]) continue;
      const matches = deck
        ? deckForModuleTitle(step.title)?.slug === deck.slug
        : normalize(step.title) !== '' && normalize(step.title) === normalize(video.moduleTitle);
      if (matches) result.byStepId[step.id] = video;
    }
  }
  return result;
}
