/**
 * "See how it works": a short, teacher-facing tour of Yawp Reporter.
 *
 * It says what Reporter does in a line or two per step and lets a clip show
 * the rest. The will / won't section is written for the reader deciding
 * whether to allow it, so every line there has to hold in
 * domain/reporter/reporter-tools.server.ts. See docs/how-to-guides.md.
 *
 * The clips were recorded in Reporter with demo classes and live in
 * public/img/reporter-guide, so the page reaches no outside site.
 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
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
import { getReporterAccess } from '~/utils/reporter/reporter-access.server';

const MEDIA = '/img/reporter-guide';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getReporterAccess(request);
  if (!access.allowed) throw redirect('/app');
  return null;
}

const WILL = [
  'Answer questions about your classes and students.',
  'Build class reports and student growth reports.',
  'Compare writing done with the tutor on and off.',
  'Point out students who may need extra support.',
  'Draft growth plans for you to save.',
];

const WONT = [
  'Change, give, or release grades.',
  'See unreleased grades, drafts, or ungraded work.',
  'See other teachers’ classes.',
  'Make up grades, averages, or student names.',
  'Save a growth plan unless you click Save.',
  'Talk to students. It’s for teachers only.',
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

export default function ReporterHowItWorksRoute() {
  const strong = (text: string) => (
    <strong className="text-foreground">{text}</strong>
  );

  return (
    <GuidePage backTo="/app/reporter" backLabel="Back to Reporter">
      <GuideHero
        title="Ask about your classes"
        highlight="in plain language."
        lede="Reporter turns your released grades into class reports, student growth reports, and growth plans."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A Reporter growth report for one student. It says Casey has been steadily improving since the beginning of the year, with the most improvement in Daily Pages, from 68% to 95%. A table lists Daily Pages entries and exit tickets with scores and whether the Tutor was on or off, and a section called The Writing quotes the teacher’s own comments.',
          width: 1120,
          height: 1064,
          caption: 'A growth report for one student in English 10',
        }}
      />

      <GuideSection
        id="guide-reports"
        eyebrow="What it can do"
        title="Reports you can run on any of your classes"
      >
        <GuideRow
          media={
            <GuideImage
              src={`${MEDIA}/starters.jpg`}
              alt="Reporter’s starter cards: Grade report for a class, Growth report for a student, Cold vs. warm writes, Who needs attention?, and How are my classes doing?"
              width={640}
              height={330}
            />
          }
        >
          <GuideCopy>
            Tap a starter card or ask your own question. Each one builds a
            report from your released grades.
          </GuideCopy>
          <GuideList
            testId="guide-reports"
            items={[
              <>
                {strong('Grade report for a class:')} every student’s average
                and the class average.
              </>,
              <>
                {strong('Growth report for a student:')} how their grades have
                changed over time.
              </>,
              <>
                {strong('Cold vs. warm writes:')} writing done with the tutor
                off, compared with the tutor on.
              </>,
              <>
                {strong('Who needs attention?')} students who are struggling or
                slipping.
              </>,
              <>
                {strong('How are my classes doing?')} a quick look at every
                class.
              </>,
            ]}
          />
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-growth"
        eyebrow="Growth reports"
        title="Track student growth over time"
      >
        <GuideRow
          media={clip(
            'overview',
            'From the dashboard, the teacher opens Reporter and taps How are my classes doing? Reporter answers with a table of classes and a table of students with their averages.'
          )}
        >
          <GuideStep n={1}>Start with a class</GuideStep>
          <GuideH3>See the whole class at once</GuideH3>
          <GuideCopy>
            Every student’s average, and who is trending down.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'growth',
            'The teacher taps Growth report for one student. The report shows a score table, a section quoting the teacher’s own feedback, and suggested next steps.'
          )}
        >
          <GuideStep n={2}>Zoom in on one student</GuideStep>
          <GuideH3>How one student is changing</GuideH3>
          <GuideCopy>
            Scores over time, what your feedback keeps saying, and suggested
            next steps. Print or save any report as a PDF.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'plan',
            'The teacher asks for a growth plan. Reporter drafts one with a focus, skills to target, instructional moves, a check-in, and conference talking points, then the teacher clicks Save growth plan.'
          )}
        >
          <GuideStep n={3}>Save a growth plan</GuideStep>
          <GuideH3>A plan you can come back to</GuideH3>
          <GuideCopy>
            Reporter drafts a growth plan with conference talking points. It’s
            saved only when you click {strong('Save growth plan')}, and later
            reports track progress against it.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3 rounded-xl border bg-background p-5 md:p-6">
          <GuideH3>Where teachers use them</GuideH3>
          <GuideList
            testId="guide-uses"
            items={[
              <>
                {strong('Parent-teacher conferences:')} bring a student’s scores
                over time and the talking points from their growth plan.
              </>,
              <>
                {strong('End of a marking period:')} sit down with each student
                and show them how their writing has changed.
              </>,
              <>
                {strong('Department meetings:')} compare how classes are doing
                and spot who needs support.
              </>,
              <>
                {strong('Meetings with administrators:')} print a class or
                student report as a PDF and bring it along.
              </>,
            ]}
          />
        </div>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips and screenshots use demo classes. Reporter’s replies in them were scripted for the recording."
        startTo="/app/reporter"
        startLabel="Ask Reporter"
      />
    </GuidePage>
  );
}
