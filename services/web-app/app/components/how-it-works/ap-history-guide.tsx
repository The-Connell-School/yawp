/**
 * "See how it works" for the AP History Essay: DBQ and LEQ practice with the
 * sources beside the draft and a Tutor coaching toward the College Board
 * rubric points.
 *
 * Every will / won't line has to hold in the code: the AP Tutor's prompt
 * (domain/ap-history/tutor-prompt.ts), the assignment snapshot
 * (domain/ap-history/schema.ts), the grader's rubric points
 * (domain/ap-history/rubric.ts, api.domain.grade-essay-ai), the grade release
 * route and the paste report. See docs/how-to-guides.md.
 *
 * The stills were captured in YAWP! with a demo class and live in
 * public/img/ap-history-guide, so the page reaches no outside site.
 *
 * Paid teachers open it from the type's page; free classroom teachers open it
 * as a teaser from a locked tile. Each route frames it with its own way back.
 */
import {
  GuideCopy,
  GuideFooter,
  GuideH3,
  GuideHero,
  GuideImage,
  GuideList,
  GuidePage,
  GuideRow,
  GuideSection,
  GuideStep,
  WillWont,
  type GuideFrameProps,
} from './guide';

const MEDIA = '/img/ap-history-guide';

const WILL = [
  'Coach each student toward the points on the College Board DBQ and LEQ rubrics.',
  'Keep the prompt and every source beside the student’s draft.',
  'Lock in the prompt, sources, and rubric when you assign it.',
  'Suggest a score and feedback for each rubric point for you to review.',
  'Show you any text pasted in from outside YAWP!',
];

const WONT = [
  'Write the essay for a student.',
  'Tell a student they are ready to submit. That call is theirs.',
  'Send student names to the Tutor.',
  'Show a student a grade before you release it.',
  'Grade an essay until you ask it to.',
];

const WHERE = [
  'Early in the year, to teach the DBQ one rubric point at a time.',
  'At the end of a unit, to practice that period’s essay.',
  'In the weeks before the AP exam.',
];

function still(name: string, alt: string, height: number) {
  return (
    <GuideImage
      src={`${MEDIA}/${name}.jpg`}
      alt={alt}
      width={1120}
      height={height}
    />
  );
}

export function ApHistoryGuide({
  backTo,
  backLabel,
  banner,
  startTo,
  startLabel,
}: GuideFrameProps) {
  return (
    <GuidePage backTo={backTo} backLabel={backLabel} banner={banner}>
      <GuideHero
        title="Practice the AP History essay"
        highlight="one rubric point at a time."
        lede="Students write DBQs and LEQs with the sources beside their draft and a Tutor that coaches toward each point on the College Board rubric. You pick the prompt and release the grade."
        image={{
          src: `${MEDIA}/student.jpg`,
          alt: 'A student’s Civil War and Reconstruction DBQ. The Tutor is on the left, the student’s opening sentences are in the middle, and Document A, the Emancipation Proclamation, is open on the right.',
          width: 1120,
          height: 700,
          caption: 'A DBQ on the Civil War and Reconstruction',
        }}
      />

      <GuideSection
        id="guide-range"
        eyebrow="What it can do"
        title="DBQs and LEQs for three AP History courses"
      >
        <GuideRow
          media={still(
            'library',
            'The AP History Prompt Library, filtered by course, essay type, reasoning skill, and difficulty. Each prompt shows its essay type, period, reasoning skill, and number of sources.',
            863
          )}
        >
          <GuideH3>A prompt library ready to assign</GuideH3>
          <GuideList
            items={[
              'AP U.S. History, AP European History, and AP World History.',
              'DBQs with their document set already attached.',
              'LEQs that students argue from their own knowledge.',
              'Filters for course, essay type, reasoning skill, and difficulty.',
            ]}
          />
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-how"
        eyebrow="For teachers"
        title="Teach the AP essay with a coach beside every student"
      >
        <GuideRow
          flip
          media={still(
            'assign',
            'The New Assignment sheet for the Civil War and Reconstruction DBQ, with a class checked, optional dates, and the first of seven sources showing.',
            1167
          )}
        >
          <GuideStep n={1}>Pick a prompt</GuideStep>
          <GuideH3>Choose a prompt and a class</GuideH3>
          <GuideCopy>
            The prompt, its sources, and the AP rubric are locked in when you
            assign it, so every student writes from the same material.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={still(
            'student',
            'A student writing a DBQ. The Tutor’s first section is Read the Documents, and the sources sit in a panel beside the draft.',
            700
          )}
        >
          <GuideStep n={2}>Students write with the Tutor</GuideStep>
          <GuideH3>
            Sources beside the draft, a coach beside the student
          </GuideH3>
          <GuideCopy>
            The Tutor works through the essay in sections, from reading the
            documents to revising, and asks about the next rubric point instead
            of writing it.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={still(
            'rubric',
            'How DBQs and LEQs are graded: the seven DBQ points and six LEQ points, each with a one-line description.',
            863
          )}
        >
          <GuideStep n={3}>Grade and release</GuideStep>
          <GuideH3>Feedback on every rubric point</GuideH3>
          <GuideCopy>
            After students submit, the Grading Assistant suggests each point
            with a comment. Change anything you disagree with, then release the
            grade.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3">
          <GuideH3>Where teachers use it</GuideH3>
          <GuideList items={WHERE} />
        </div>
      </GuideSection>

      <GuideSection id="guide-extras" eyebrow="Also" title="Write your own">
        <GuideCopy>
          Build a custom DBQ or LEQ. Paste or upload your sources, or upload a
          PDF to fill in the prompt and documents. Custom essays can be timed.
        </GuideCopy>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Screenshots use a demo class and a sample draft."
        startTo={startTo}
        startLabel={startLabel}
      />
    </GuidePage>
  );
}
