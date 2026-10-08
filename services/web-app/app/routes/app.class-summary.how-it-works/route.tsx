/**
 * "See how it works": a short, teacher-facing tour of the class performance
 * summary.
 *
 * It says what the summary does in a line or two per step and lets a clip
 * show the rest. The will / won't section is written for the reader deciding
 * whether to allow it, so every line there has to hold in
 * domain/assignment-insights (the prompt in class-insight-synthesis.ts sees
 * only class-wide rubric numbers; groups come from differentiate-students.ts,
 * not the model). See docs/how-to-guides.md.
 *
 * The clips were recorded with demo classes and live in
 * public/img/class-summary-guide, so the page reaches no outside site.
 */
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import {
  GuideClip,
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
} from '~/components/how-it-works/guide';
import { requireMembership, requireUserId } from '~/utils/auth.server';

const MEDIA = '/img/class-summary-guide';

/** A summary page the guide was opened from, and nothing else. */
const SUMMARY_PATH = /^\/app\/my-classes\/[^/?#]+\/summary\/[^/?#]+$/;

export function classSummaryGuideBackTo(from: string | null): string {
  return from && SUMMARY_PATH.test(from) ? from : '/app/my-classes';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');
  if (!profile.organization.classInsightsEnabled) throw redirect('/app');

  const from = new URL(request.url).searchParams.get('from');
  return { backTo: classSummaryGuideBackTo(from) };
}

const WILL = [
  'Show how the class did on each rubric category.',
  'Show examples from your students’ essays.',
  'Suggest next steps for your teaching.',
  'Suggest small groups and students to check in with.',
  'Compare the same assignment across your sections.',
];

const WONT = [
  'Send student names, essays, or your comments to the AI.',
  'Use AI to sort students into groups. Groups come from rubric scores.',
  'Make up student examples. Each one is quoted from a student’s essay.',
  'Include work you haven’t graded.',
  'Change, give, or release grades.',
  'Show the summary to students. It’s for teachers only.',
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

export default function ClassSummaryHowItWorksRoute() {
  const { backTo } = useLoaderData<typeof loader>();
  const strong = (text: string) => (
    <strong className="text-foreground">{text}</strong>
  );
  const backLabel =
    backTo === '/app/my-classes' ? 'Back to My Classes' : 'Back to the summary';

  return (
    <GuidePage backTo={backTo} backLabel={backLabel}>
      <GuideHero
        title="See how your whole class did"
        highlight="on one assignment."
        lede="The class performance summary turns your grades on an assignment into class-wide strengths, gaps, and next teaching steps."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A class performance summary for a Macbeth essay: 20 submissions, a two-sentence overview, and rubric categories marked Strength, Mixed, and Needs work.',
          width: 868,
          height: 720,
          caption: 'A class summary for a Macbeth essay in English 10',
        }}
      />

      <GuideSection
        id="guide-parts"
        eyebrow="What it can do"
        title="Everything in a class summary"
      >
        <GuideRow
          media={
            <GuideImage
              src={`${MEDIA}/steps.jpg`}
              alt="Three suggested next steps, a small group of ten students who scored 2 or below on Evidence/Support, one student to check in with, and three students marked Ready for more."
              width={868}
              height={855}
            />
          }
        >
          <GuideCopy>
            Each summary is built from your rubric scores on one assignment.
          </GuideCopy>
          <GuideList
            testId="guide-parts"
            items={[
              <>
                {strong('How the class did:')} each rubric category marked
                Strength, Mixed, or Needs work.
              </>,
              <>
                {strong('Student examples:')} lines from your students’ essays
                for each category.
              </>,
              <>
                {strong('Suggested next steps:')} teaching moves aimed at the
                biggest gaps.
              </>,
              <>
                {strong('Differentiation starting points:')} small groups,
                students to check in with, and students ready for more.
              </>,
              <>
                {strong('All sections:')} the same assignment read across every
                class you teach it in.
              </>,
            ]}
          />
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-plan"
        eyebrow="Class summaries"
        title="Plan your next lesson from your grades"
      >
        <GuideRow
          media={clip(
            'open',
            'On the Documents tab, filtered to the Macbeth essay, the teacher clicks Class performance summary, then Summarize class performance. The summary appears with an overview and a card for each rubric category.'
          )}
        >
          <GuideStep n={1}>Summarize the class</GuideStep>
          <GuideH3>One click after you grade</GuideH3>
          <GuideCopy>
            Open an assignment on your Documents tab and click{' '}
            {strong('Class performance summary')}. As you grade more, you can
            update it once a day.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'examples',
            'The teacher opens Evidence/Support, marked Needs work, and three short excerpts from student essays appear, each with the student’s name and score.'
          )}
        >
          <GuideStep n={2}>Find the gaps</GuideStep>
          <GuideH3>See what the class did well and where it struggled</GuideH3>
          <GuideCopy>
            Every rubric category gets a status and a one-line reason. Open one
            to read examples from your students’ essays.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'groups',
            'The teacher scrolls to Suggested next steps and Differentiation starting points: a small group for Evidence/Support, a smaller group for Organization/Structure, one student to check in with, and three students ready for more.'
          )}
        >
          <GuideStep n={3}>Plan what’s next</GuideStep>
          <GuideH3>Turn the gaps into next steps</GuideH3>
          <GuideCopy>
            Suggested teaching moves, small groups, and students to check in
            with, drawn from rubric scores.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3 rounded-xl border bg-background p-5 md:p-6">
          <GuideH3>Where teachers use it</GuideH3>
          <GuideList
            testId="guide-uses"
            items={[
              <>
                {strong('Planning the next lesson:')} reteach the skill most of
                the class missed.
              </>,
              <>
                {strong('Small-group days:')} pull the students who scored low
                on the same skill.
              </>,
              <>
                {strong('Department and PLC meetings:')} compare sections and
                bring real examples of student work.
              </>,
              <>
                {strong('After a diagnostic:')} see where a class starts before
                you teach a unit.
              </>,
            ]}
          />
        </div>
      </GuideSection>

      <GuideSection
        id="guide-sections"
        eyebrow="Across sections"
        title="Compare every section you teach"
      >
        <GuideRow
          flip
          media={clip(
            'sections',
            'The teacher switches from This class to All 2 sections. Each rubric category shows how Period 2 and Period 4 did, with Split across sections where they differ.'
          )}
        >
          <GuideCopy>
            Teach the same assignment in more than one class? Click{' '}
            {strong('All sections')} to see where your classes agree and where
            they split.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes. The summary’s written lines in them were scripted for the recording from the demo classes’ real scores."
        startTo={backTo}
        startLabel={
          backTo === '/app/my-classes'
            ? 'Go to My Classes'
            : 'Back to the summary'
        }
      />
    </GuidePage>
  );
}
