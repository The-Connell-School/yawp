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

function overview(folder: string, label: string): GuideVideo {
  return {
    src: `/img/${folder}/overview.mp4`,
    poster: `/img/${folder}/overview.jpg`,
    label,
    ...SIZE,
  };
}

export const GUIDE_OVERVIEW_VIDEOS: Record<GuideHowToTeachKey, GuideVideo> = {
  'class-starter': overview(
    'class-starter-guide',
    'A tour of Class Starter with no sound. The teacher opens Class Starter, browses the Prompt Library, picks a prompt and makes it an assignment for a class. A student writes a response and submits it. The teacher opens it and asks the Grading Assistant for a suggested engagement score and comment.'
  ),
  prewriting: overview(
    'prewriting-guide',
    'A tour of Pre-Writing with no sound. The teacher opens Pre-Writing, finds the lesson’s slide deck and tutorial under How to Teach It, picks an essay prompt from the library and assigns it. A student writes freely about the prompt with the Tutor asking questions, labels a focus at the bottom of the page and submits it.'
  ),
  'thesis-statement': overview(
    'thesis-statement-guide',
    'A tour of Thesis Statement with no sound. The teacher opens Thesis Statement, finds the lesson’s slide deck and tutorial under How to Teach It, and assigns the same prompt students pre-wrote on. A student drafts a one-sentence thesis with the Tutor’s feedback and submits it.'
  ),
  'exit-ticket': overview(
    'exit-ticket-guide',
    'A tour of Exit Ticket with no sound. The teacher opens Exit Ticket, clicks New, chooses Check for understanding, names the idea to check and assigns it to a class. A student explains the idea in their own words and submits it. The teacher reads the class’s answers.'
  ),
};
