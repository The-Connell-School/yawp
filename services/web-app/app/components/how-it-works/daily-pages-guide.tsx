/**
 * "See how it works" for Daily Pages: short, low-stakes writing graded on
 * engagement, from a prompt library or the teacher's own prompt.
 *
 * Every will / won't line has to hold in the code: the engagement rubric and
 * its tier bands (domain/assignment-types/daily-pages-engagement-rubric.ts,
 * daily-pages-engagement-tier-bands.ts), the point minimum the create route
 * enforces, the grammar pass the grader skips for a rubric with no grammar
 * category (api.domain.grade-essay-ai), the Tutor's universal instructions
 * (packages/prisma/scripts/universal-tutor-block.ts), the Tutor route, the
 * grade release route, and the paste report. Paragraph type and writing time
 * were removed (#426), so the guide names neither. See docs/how-to-guides.md.
 *
 * The clips were recorded in YAWP! with a demo class and live in
 * public/img/daily-pages-guide, so the page reaches no outside site.
 *
 * Paid teachers open it from the type's page; free classroom teachers open it
 * as a teaser from a locked tile. Each route frames it with its own way back.
 */
import {
  GuideClip,
  GuideCopy,
  GuideFooter,
  GuideH3,
  GuideHero,
  GuideList,
  GuidePage,
  GuideRow,
  GuideSection,
  GuideStep,
  WillWont,
  type GuideFrameProps,
} from './guide';

const MEDIA = '/img/daily-pages-guide';

const WILL = [
  'Score each entry on engagement: whether the student took up the prompt and put real thinking on the page.',
  'Suggest a tier, a score, and a note to the student for you to review.',
  'Give every Excellent entry the full point total.',
  'Use the point total you choose, from 5 points up.',
  'Show you any text pasted in from outside YAWP!',
];

const WONT = [
  'Write the entry for a student.',
  'Send student names to the Tutor.',
  'Show a student a grade before you release it.',
  'Grade an entry until you ask it to.',
  'Score or mark grammar, spelling, or mechanics.',
];

const KINDS = [
  'Close-read a passage: back into the text for specific words.',
  'Claim and defend: a position, a reason, and a case that tests it.',
  'Two things, one difference: the one distinction that matters.',
  'Evaluate a choice: a judgment that names its standard.',
  'Define precisely: a definition tested with a hard case.',
  'Your own prompt, typed into the assignment.',
];

const WHERE = [
  'At the start of class, as a bell ringer.',
  'At the end of a lesson, as a quick reflection.',
  'Once a week, as a journal entry.',
];

function clip(name: string, label: string) {
  return (
    <GuideClip
      src={`${MEDIA}/${name}.mp4`}
      poster={`${MEDIA}/${name}.jpg`}
      label={label}
    />
  );
}

export function DailyPagesGuide({
  backTo,
  backLabel,
  banner,
  startTo,
  startLabel,
}: GuideFrameProps) {
  return (
    <GuidePage backTo={backTo} backLabel={backLabel} banner={banner}>
      <GuideHero
        title="Daily writing,"
        highlight="graded on engagement."
        lede="Short, low-stakes writing your students can do every day. The Grading Assistant scores each entry on whether the student took up the prompt, not on grammar, and you release the grade."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A student’s Daily Pages entry on “A mistake and a failure.” The Tutor is on the left, and the prompt sits above the student’s paragraph.',
          width: 1120,
          height: 700,
          caption: 'An entry on a prompt from the library',
        }}
      />

      <GuideSection
        id="guide-range"
        eyebrow="What it can do"
        title="A prompt library ready to assign"
      >
        <GuideRow
          media={clip(
            'library',
            'The Daily Pages prompt library, filtered to prompts that need no source text and define a term, then opening “A mistake and a failure.”'
          )}
        >
          <GuideH3>Five kinds of prompts, or your own</GuideH3>
          <GuideList items={KINDS} />
          <GuideCopy>
            Filter by kind, length, source text, and grade band.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-how"
        eyebrow="For teachers"
        title="Assign daily writing and grade it on engagement"
      >
        <GuideRow
          flip
          media={clip(
            'assign',
            'Assigning “A mistake and a failure” to English 10, Period 3, at 10 points, with the engagement tiers for that total.'
          )}
        >
          <GuideStep n={1}>Assign it</GuideStep>
          <GuideH3>Choose a class and a point total</GuideH3>
          <GuideCopy>
            Pick any whole number of points from 5 up. Every Excellent entry
            gets the full total.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'write',
            'A student opens the entry, writes a short paragraph under the prompt, and submits it.'
          )}
        >
          <GuideStep n={2}>Students write</GuideStep>
          <GuideH3>The prompt above the page, the Tutor beside it</GuideH3>
          <GuideCopy>
            Rough writing is welcome. The Tutor gives feedback when a student
            asks for it and never writes the entry.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'grade',
            'The Grading Assistant suggests Excellent, 10 of 10, with a note to the student. The teacher adds a line, saves, and releases the grade.'
          )}
        >
          <GuideStep n={3}>Grade and release</GuideStep>
          <GuideH3>A tier, a score, and a short note</GuideH3>
          <GuideCopy>
            The Grading Assistant suggests a tier, a score, and a note to the
            student. Change anything you disagree with, then release the grade.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3">
          <GuideH3>Where teachers use it</GuideH3>
          <GuideList items={WHERE} />
        </div>
      </GuideSection>

      <GuideSection
        id="guide-extras"
        eyebrow="Also"
        title="Turn the Tutor off for a cold write"
      >
        <GuideCopy>
          Switch the Tutor off when you create the assignment to see what
          students write on their own.
        </GuideCopy>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use a demo class. The Grading Assistant’s suggestion in them was scripted for the recording."
        startTo={startTo}
        startLabel={startLabel}
      />
    </GuidePage>
  );
}
