/**
 * How to Teach It on a How It Works page: the landing page's collapsible
 * block, on a white card with the soft shadow of the guide's other cards
 * (Brian's rebuilt teacher page). Open on arrival; Hide folds it to its
 * heading and a two-line preview.
 */
import {
  HowToTeachSection,
  type LessonVideos,
} from '../app.assignment-types.$id/landing-copy/assignment-type-landing';
import { guideHowToTeachSection, type GuideHowToTeachKey } from './how-to-teach';

const WHITE_CARD = [
  'border-transparent bg-white',
  'shadow-[0_2px_8px_rgba(0,0,0,0.18)]',
  'hover:border-transparent hover:shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
  'has-[:focus-visible]:shadow-[0_6px_18px_rgba(0,0,0,0.22)]',
  'dark:bg-background',
].join(' ');

export function GuideHowToTeach({
  guideKey,
  lessonVideos = {},
}: {
  guideKey: GuideHowToTeachKey;
  /** Each lesson's tutorial page, by lesson number, where this teacher can open it. */
  lessonVideos?: LessonVideos;
}) {
  return (
    <HowToTeachSection
      section={guideHowToTeachSection(guideKey)}
      lessonVideos={lessonVideos}
      className={WHITE_CARD}
    />
  );
}
