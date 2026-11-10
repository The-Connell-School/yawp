/**
 * The overview video at the top of each How It Works page (Kevin, Nov 10).
 *
 * Each is a short tour with no sound, recorded from the app itself with demo
 * classes by e2e/tools/record-how-it-works-overviews.ts, with a caption on
 * each step. They stand in until Brian records his own: to swap one in,
 * replace overview.mp4 and overview.jpg in the guide's folder under
 * public/img, and update its label to say what the new video shows.
 */
import type { GuideVideo } from '~/components/how-it-works/guide';
import type { GuideHowToTeachKey } from './how-to-teach';

const SIZE = { width: 1280, height: 800 };

/** Said under the three videos that show the Grading Assistant. */
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

export const GUIDE_OVERVIEW_VIDEOS: Record<GuideHowToTeachKey, GuideVideo> = {
  'class-starter': overview(
    'class-starter-guide',
    'A tour of Class Starter with no sound. The teacher opens Class Starter and its How it works, browses the Prompt Library, then clicks New, writes a prompt, picks a class and creates the assignment. A student writes about a promise they broke and submits it. The teacher opens it, and the Grading Assistant suggests an engagement level and a comment for the teacher to review and release.',
    SCRIPTED_GRADING
  ),
  prewriting: overview(
    'prewriting-guide',
    'A tour of Pre-Writing with no sound. The teacher opens Pre-Writing, points to the lesson’s slide deck and tutorial under How to Teach It, browses the essay Prompt Library, and assigns a prompt to a class. A student writes nonstop about the prompt with the Tutor’s instructions beside the page, labels a focus at the bottom and submits it. The teacher opens it, and the Grading Assistant suggests a score and a comment on the focus.',
    SCRIPTED_GRADING
  ),
  'thesis-statement': overview(
    'thesis-statement-guide',
    'A tour of Thesis Statement with no sound. The teacher opens Thesis Statement, points to the lesson’s slide deck and tutorial under How to Teach It, and assigns the prompt students pre-wrote on. A student writes a one-sentence thesis with the Tutor beside the page and submits it. The teacher opens it, and the Grading Assistant suggests a score and a comment on the thesis.',
    SCRIPTED_GRADING
  ),
  'exit-ticket': overview(
    'exit-ticket-guide',
    'A tour of Exit Ticket with no sound. The teacher opens Exit Ticket, clicks New, chooses Check for understanding, names the idea (the difference between weathering and erosion), says there is a correct answer, and sees the question students will read. The Tutor starts off and the ticket ungraded. A student explains the idea in their own words and submits it, and the teacher reads the answer.'
  ),
};
