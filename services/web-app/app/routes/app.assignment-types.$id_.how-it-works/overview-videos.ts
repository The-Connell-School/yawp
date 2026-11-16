/**
 * The video at the top of each How It Works page (Kevin, Nov 10).
 *
 * Pre-Writing and Thesis Statement open with Brian's tutorial for that lesson
 * of The Thesis-Driven Essay course (Nov 14): the file its "Watch tutorial"
 * page plays, with his voice and captions (thesis-essay-course.ts).
 *
 * Class Starter and Exit Ticket still open with a short tour with no sound,
 * recorded from the app itself with demo classes by
 * e2e/tools/record-how-it-works-overviews.ts, with a caption on each step.
 * They stand in until Brian records those two: to swap one in, replace
 * overview.mp4 and overview.jpg in the guide's folder under public/img, add
 * its captions, and update its label and note to say what the new video is.
 */
import type { GuideVideo } from '~/components/how-it-works/guide';
import {
  COURSE_TUTORIAL_SIZE,
  THESIS_ESSAY_COURSE,
} from '../app.assignment-types.$id/landing-copy/thesis-essay-course';
import type { GuideHowToTeachKey } from './how-to-teach';

const SIZE = { width: 1280, height: 800 };

/** Said under a tour that shows the Grading Assistant (Class Starter). */
const SCRIPTED_GRADING =
  'A quick tour, recorded in Yawp! with demo classes. The Grading Assistant’s suggestion in it was scripted for the recording. No sound.';

function overview(folder: string, label: string, note?: string): GuideVideo {
  return {
    src: `/img/${folder}/overview.mp4`,
    poster: `/img/${folder}/overview.jpg`,
    label,
    ...SIZE,
    ...(note ? { note } : {}),
  };
}

/** Brian's tutorial for a lesson of the course (numbered from 1). */
function tutorial(lessonNumber: number, label: string): GuideVideo {
  const video = THESIS_ESSAY_COURSE[lessonNumber - 1]!.tutorials[0]!;
  return {
    src: video.src,
    poster: video.poster,
    captions: video.captions,
    label,
    ...COURSE_TUTORIAL_SIZE,
    note: `Brian Connell on how to teach this lesson. About ${video.minutes} minutes, with captions.`,
  };
}

export const GUIDE_OVERVIEW_VIDEOS: Record<GuideHowToTeachKey, GuideVideo> = {
  'class-starter': overview(
    'class-starter-guide',
    'A tour of Class Starter with no sound. The teacher opens Class Starter and its How it works, browses the Prompt Library, then clicks New, writes a prompt, picks a class and creates the assignment. A student writes about a promise they broke and submits it. The teacher opens it, and the Grading Assistant suggests an engagement level and a comment for the teacher to review and release.',
    SCRIPTED_GRADING
  ),
  prewriting: tutorial(
    2,
    'Brian Connell explains how to teach the pre-writing lesson, talking over its slide deck. He says why students need class time to pre-write, opens with a game where the class calls out the details they notice in a photograph, has students write nonstop about the prompt for a few minutes at a time, and ends with each student writing a focus at the bottom of the page.'
  ),
  'thesis-statement': tutorial(
    3,
    'Brian Connell explains how to teach the thesis statement lesson, talking over its slide deck. He says why a thesis should be specific and not broad, plays “What’s going on in this picture?” so the class observes and then analyzes, shows that a strong thesis joins an observation to an analysis, and has students write and revise their own while the teacher works the room.'
  ),
  'exit-ticket': overview(
    'exit-ticket-guide',
    'A tour of Exit Ticket with no sound. The teacher opens Exit Ticket, clicks New, chooses Check for understanding, names the idea (the difference between weathering and erosion), says there is a correct answer, and sees the question students will read. The Tutor starts off and the ticket ungraded. A student explains the idea in their own words and submits it, and the teacher reads the answer.'
  ),
};
