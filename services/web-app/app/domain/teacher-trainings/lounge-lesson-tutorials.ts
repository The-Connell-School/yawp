/**
 * Brian's tutorial videos (Nov 14) in the Lounge's own Thesis-Driven Essay
 * course. They come with the app (thesis-essay-course.ts), so a "Lesson N: …"
 * module of that course plays the tutorial for lesson N in place of the older
 * video uploaded to it. The upload is left where it is: a module with no
 * tutorial (the course's opening videos, Review my essay, any other course)
 * still plays it, and taking a tutorial out of the catalog brings it back.
 *
 * No database reads here, so the pages and their loaders can both use it.
 */
import {
  THESIS_ESSAY_COURSE,
  type CourseTutorial,
} from '~/routes/app.assignment-types.$id/landing-copy/thesis-essay-course';

/** The Lounge course, as its title is typed in the admin. */
export const THESIS_ESSAY_TRAINING_TITLE = 'The Thesis-Driven Essay';

const LESSON_NUMBER = /^\s*lesson\s+(\d{1,2})\b/i;

/** "Lesson 2: Pre-writing" is lesson 2. A module not named for a lesson: null. */
export function lessonNumberOfTrainingModule(moduleTitle: string): number | null {
  const number = Number(LESSON_NUMBER.exec(moduleTitle)?.[1]);
  return number > 0 ? number : null;
}

/**
 * The tutorials a Lounge module plays, first one in the player. None: the
 * module plays its own uploaded video.
 */
export function tutorialsForTrainingModule(courseTitle: string, moduleTitle: string): CourseTutorial[] {
  if (courseTitle.trim().toLowerCase() !== THESIS_ESSAY_TRAINING_TITLE.toLowerCase()) return [];
  const lesson = lessonNumberOfTrainingModule(moduleTitle);
  return (lesson && THESIS_ESSAY_COURSE[lesson - 1]?.tutorials) || [];
}

type WatchedModule = {
  title: string;
  videoDuration: number | null;
  teacherTrainingModuleSessions?: Array<{ videoTimestamp: number }>;
};

/**
 * A module as the teacher watches it: with a tutorial, its length is the
 * tutorial's, and how far they got is held to that length. The tutorials are
 * shorter than the videos they replaced, so a teacher who finished the old
 * one reads as finished, not as 31 minutes into a 14-minute video.
 */
export function withLessonTutorial<M extends WatchedModule>(courseTitle: string, module: M): M {
  const tutorial = tutorialsForTrainingModule(courseTitle, module.title)[0];
  if (!tutorial) return module;
  return {
    ...module,
    videoDuration: tutorial.seconds,
    ...(module.teacherTrainingModuleSessions
      ? {
          teacherTrainingModuleSessions: module.teacherTrainingModuleSessions.map((session) => ({
            ...session,
            videoTimestamp: Math.min(session.videoTimestamp, tutorial.seconds),
          })),
        }
      : {}),
  };
}
