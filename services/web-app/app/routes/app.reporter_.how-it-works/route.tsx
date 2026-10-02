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
  'Change, give or release grades.',
  'See unreleased grades, drafts or ungraded work.',
  'See other teachers’ classes.',
  'Make up grades, averages or student names.',
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
  return (
    <GuidePage backTo="/app/reporter" backLabel="Back to Reporter">
      <GuideHero
        title="Ask about your classes"
        highlight="in plain language."
        lede="Reporter turns your released grades into class reports, student growth reports and growth plans."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A Reporter growth report for one student: a 55% average, a table of exit ticket scores, and the start of a section called The Writing.',
          width: 1120,
          height: 888,
          caption: 'A growth report for one student in English 10',
        }}
      />

      <GuideSection
        id="guide-start"
        eyebrow="Where it lives"
        title="In the sidebar, under Teacher’s Lounge"
      >
        <GuideCopy>
          Open <strong className="text-foreground">Reporter</strong> and ask a
          question, or start from one of the five starter cards.
        </GuideCopy>
      </GuideSection>

      <GuideSection
        id="guide-how"
        eyebrow="For teachers"
        title="From a question to a plan for one student"
      >
        <GuideRow
          media={clip(
            'overview',
            'From the dashboard, the teacher opens Reporter and taps How are my classes doing? Reporter answers with a table of classes and a table of students with their averages.'
          )}
        >
          <GuideStep n={1}>Ask</GuideStep>
          <GuideH3>Answers from your own grades</GuideH3>
          <GuideCopy>
            Reporter reads your classes, assignments and released grades, and
            answers with the numbers.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'growth',
            'The teacher taps Growth report for one student. The report shows a score table, a section quoting the teacher’s own feedback, and suggested next steps.'
          )}
        >
          <GuideStep n={2}>Read a growth report</GuideStep>
          <GuideH3>How one student is changing</GuideH3>
          <GuideCopy>
            Scores over time, what your feedback keeps saying, and suggested
            next steps. Print or save any report as a PDF.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'plan',
            'The teacher asks for a growth plan. Reporter drafts one with a focus, skills to target, instructional moves, a check-in and conference talking points, then the teacher clicks Save growth plan.'
          )}
        >
          <GuideStep n={3}>Save a growth plan</GuideStep>
          <GuideH3>A plan you can come back to</GuideH3>
          <GuideCopy>
            Reporter drafts a growth plan with conference talking points. It’s
            saved only when you click{' '}
            <strong className="text-foreground">Save growth plan</strong>, and
            later reports track progress against it.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes. Reporter’s replies in them were scripted for the recording from the demo class’s real numbers."
        startTo="/app/reporter"
        startLabel="Ask Reporter"
      />
    </GuidePage>
  );
}
