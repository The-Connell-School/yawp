/**
 * "See how it works" for a single step of the thesis-driven essay, assigned on
 * its own: Prewriting or Thesis Statement. Same shape as the full essay's
 * guide, shorter: what the step is, the three beats of running it, how it is
 * scored, and the will / won't.
 *
 * No clips yet. When the walk-through video is recorded it goes in the hero.
 */
import {
  GuideCopy,
  GuideFooter,
  GuideH3,
  GuideHero,
  GuidePage,
  GuideSection,
  GuideStep,
  WillWont,
} from '~/components/how-it-works/guide';
import { LessonMaterialsCard } from '~/components/lesson-materials-card';
import type { LessonMaterials } from '~/domain/assignment-types/lesson-materials.server';
import {
  scoringLine,
  WRITING_STEP_WILL,
  WRITING_STEP_WONT,
  type WritingStepCopy,
} from '../app.assignment-types.$id/about-writing-step/content';

export function WritingStepGuide({
  copy,
  pagePath,
  lesson,
}: {
  copy: WritingStepCopy;
  pagePath: string;
  lesson: LessonMaterials | null;
}) {
  return (
    <GuidePage backTo={pagePath} backLabel={`Back to ${copy.title}`}>
      <GuideHero
        title={`Teach ${copy.title}`}
        highlight={copy.guideHighlight}
        lede={copy.lede}
      />

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
        {lesson ? (
          <LessonMaterialsCard
            lesson={lesson}
            className="rounded-xl border bg-background p-5 shadow-sm md:max-w-md"
          />
        ) : null}
      </GuideSection>

      <GuideSection
        id="guide-tutor"
        eyebrow="The Yawp! Tutor"
        title="How the Tutor helps, and how it’s scored"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border bg-background p-5">
            <GuideH3>While they write</GuideH3>
            <GuideCopy>{copy.tutor}</GuideCopy>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border bg-background p-5">
            <GuideH3>When they submit</GuideH3>
            <GuideCopy>
              {scoringLine(copy.rubric)} {copy.scoringNote} You review the
              suggested score and feedback, and students see nothing until you
              release it.
            </GuideCopy>
          </div>
        </div>
      </GuideSection>

      <WillWont will={WRITING_STEP_WILL} wont={WRITING_STEP_WONT} />

      <GuideFooter
        note={`${copy.title} is one step of the thesis-driven essay, assigned on its own.`}
        startTo={pagePath}
        startLabel="Create an assignment"
      />
    </GuidePage>
  );
}
