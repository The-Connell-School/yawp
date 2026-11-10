/**
 * "See how it works" for a single step of the thesis-driven essay, assigned on
 * its own: Prewriting or Thesis Statement. Same shape as the full essay's
 * guide, shorter: what the step is, the three beats of running it, how it is
 * scored, and the will / won't.
 *
 * With Brian's landing pages on (`assignment-type-landing-v2`), the overview
 * video sits at the top and How to Teach It under it, with the lesson's slide
 * deck and tutorial (Kevin, Nov 10). The lesson card further down then goes:
 * How to Teach It carries the same lesson.
 */
import {
  GuideCard,
  GuideCopy,
  GuideFooter,
  GuideH3,
  GuideHero,
  GuidePage,
  GuidePanel,
  GuideSection,
  GuideStep,
  WillWont,
} from '~/components/how-it-works/guide';
import { guideAccentFor } from '~/components/how-it-works/guide-accents';
import { LessonMaterialsCard } from '~/components/lesson-materials-card';
import type { LessonMaterials } from '~/domain/assignment-types/lesson-materials.server';
import {
  scoringLine,
  WRITING_STEP_WILL,
  WRITING_STEP_WONT,
  type WritingStepCopy,
  type WritingStepKind,
} from '../app.assignment-types.$id/about-writing-step/content';
import { PREWRITING_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/prewriting-assignment-type';
import type { LessonVideos } from '../app.assignment-types.$id/landing-copy/assignment-type-landing';
import { GuideHowToTeach } from './guide-how-to-teach';
import { GUIDE_OVERVIEW_VIDEOS } from './overview-videos';

export function WritingStepGuide({
  kind,
  copy,
  pagePath,
  lesson,
  v2 = false,
  lessonVideos = {},
}: {
  /** Which step: picks the page's accent (Brian, Nov 5). */
  kind: WritingStepKind;
  copy: WritingStepCopy;
  pagePath: string;
  lesson: LessonMaterials | null;
  /** Brian's landing pages are on: the video at the top and How to Teach It. */
  v2?: boolean;
  /** Each lesson's tutorial page, by lesson number, where this teacher can open it. */
  lessonVideos?: LessonVideos;
}) {
  const guideKey = kind === PREWRITING_ASSIGNMENT_TYPE_KIND ? 'prewriting' : 'thesis-statement';
  return (
    <GuidePage
      backTo={pagePath}
      backLabel={`Back to ${copy.title}`}
      accent={guideAccentFor(guideKey)}
    >
      <GuideHero
        title={`Teach ${copy.title}`}
        highlight={copy.guideHighlight}
        lede={copy.lede}
        video={v2 ? GUIDE_OVERVIEW_VIDEOS[guideKey] : null}
      />

      {v2 ? <GuideHowToTeach guideKey={guideKey} lessonVideos={lessonVideos} /> : null}

      <GuideSection
        id="guide-how"
        eyebrow="How it works"
        title="Teach it, assign it, and let the Tutor reinforce it"
      >
        <ol className="grid gap-6 md:grid-cols-3">
          {copy.steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2">
              <GuideStep n={i + 1}>{step.title}</GuideStep>
              <GuideCopy>{step.detail}</GuideCopy>
            </li>
          ))}
        </ol>
        {lesson && !v2 ? (
          <LessonMaterialsCard
            lesson={lesson}
            className="rounded-xl border bg-background p-5 shadow-sm md:max-w-md"
          />
        ) : null}
      </GuideSection>

      <GuidePanel
        id="guide-tutor"
        eyebrow="The Yawp! Tutor"
        title="How the Tutor helps, and how it’s scored"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <GuideCard>
            <GuideH3>While they write</GuideH3>
            <GuideCopy>{copy.tutor}</GuideCopy>
          </GuideCard>
          <GuideCard>
            <GuideH3>When they submit</GuideH3>
            <GuideCopy>
              {scoringLine(copy.rubric)} {copy.scoringNote} You review the
              suggested score and feedback, and students see nothing until you
              release it.
            </GuideCopy>
          </GuideCard>
        </div>
      </GuidePanel>

      <WillWont will={WRITING_STEP_WILL} wont={WRITING_STEP_WONT} />

      <GuideFooter
        note={`${copy.title} is one step of the thesis-driven essay, assigned on its own.`}
        startTo={pagePath}
        startLabel="Create an assignment"
      />
    </GuidePage>
  );
}
