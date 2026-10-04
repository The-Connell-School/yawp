/**
 * "See how it works": a short, teacher-facing tour of The Thesis-Driven Essay.
 *
 * It says what the essay does in a line or two per step and lets a clip show
 * the rest. The will / won't section is written for the reader deciding
 * whether to allow it, so every line there has to hold in the code: the
 * Tutor's module instructions, api.domain.tutor-response, the grade release
 * route and the paste report. See docs/how-to-guides.md.
 *
 * The clips were recorded in YAWP! with demo classes and live in
 * public/img/thesis-essay-guide, so the page reaches no outside site.
 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  Eyebrow,
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
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import { isAssignmentTypeAvailableForAnyScope } from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { TransferChart } from './transfer-chart';

const MEDIA = '/img/thesis-essay-guide';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');

  const assignmentTypeId = params.id ?? '';
  const pagePath = `/app/assignment-types/${assignmentTypeId}`;

  // The same access check as the assignment type page: the type has to be
  // switched on for one of this teacher's schools.
  const teacherClasses = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: { school: { select: { id: true, organizationId: true } } },
  });
  const scopes =
    teacherClasses.length === 0
      ? [{ organizationId: profile.organization.id, teacherProfileId: profile.id }]
      : teacherClasses.map((klass) => ({
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: profile.id,
        }));
  const available = await isAssignmentTypeAvailableForAnyScope({
    assignmentTypeId,
    scopes,
  });
  if (!available) throw redirect('/app');

  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: assignmentTypeId, archivedAt: null },
    select: { id: true, title: true },
  });
  // Only The Thesis-Driven Essay has a guide so far.
  if (!assignmentType || !isThesisDrivenEssayTitle(assignmentType.title)) {
    throw redirect(pagePath);
  }

  return { pagePath };
}

const TUTOR_POINTS = [
  {
    title: 'Keeps them on the essay',
    detail: 'Off-topic questions get a friendly nudge back to the writing.',
  },
  {
    title: 'Reviews before they submit',
    detail:
      'The last step checks content, organization, syntax and grammar. It doesn’t give a grade.',
  },
  {
    title: 'Steps aside for cold writes',
    detail: 'Turn it off and students see only the prompt.',
  },
];

const WILL = [
  'Walk students through the essay one step at a time.',
  'Ask questions and give feedback on the student’s own draft.',
  'Suggest a score and feedback for you to review.',
  'Show you any text pasted in from outside YAWP!',
  'Let you give a cold write with the Tutor off.',
];

const WONT = [
  'Write the essay for a student.',
  'Send student names to the Tutor.',
  'Let the Tutor see other students’ essays.',
  'Show a student a grade before you release it.',
  'Grade an essay until you ask it to.',
  'Accuse a student of cheating or of using AI.',
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

export default function ThesisEssayHowItWorksRoute() {
  const { pagePath } = useLoaderData<typeof loader>();

  return (
    <GuidePage backTo={pagePath} backLabel="Back to The Thesis-Driven Essay">
      <GuideHero
        title="Teach the thesis-driven essay"
        highlight="one step at a time."
        lede="Students write a full critical essay with the YAWP! Tutor beside them, from first ideas to a title. You choose the prompt and release the grade."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A student’s Macbeth essay beside the YAWP! Tutor. The student has asked the Tutor to write the rest of a paragraph, and the Tutor answers that the paragraph is theirs to write and asks what Banquo notices about Macbeth.',
          width: 1120,
          height: 700,
          caption: 'The Tutor on a body paragraph about Macbeth',
        }}
      />

      <GuideSection
        id="guide-start"
        eyebrow="Where it lives"
        title="On The Thesis-Driven Essay page"
      >
        <GuideCopy>
          Open <strong className="text-foreground">The Thesis-Driven Essay</strong>{' '}
          and choose <strong className="text-foreground">New</strong>, then{' '}
          <strong className="text-foreground">Assignment</strong>. When you
          assign it you set the due date, the points, the time limit and
          whether the Tutor and grammar grading are on.
        </GuideCopy>
      </GuideSection>

      <GuideSection
        id="guide-how"
        eyebrow="For teachers"
        title="From a prompt to a released grade"
      >
        <GuideRow
          media={clip(
            'prompts',
            'The teacher opens the Prompt Library, searches for Macbeth and picks the prompt. It opens in the New Assignment sheet, where the teacher chooses English 10, adds a title and creates the assignment.'
          )}
        >
          <GuideStep n={1}>Pick a prompt</GuideStep>
          <GuideH3>100 essay prompts ready to assign</GuideH3>
          <GuideCopy>
            Search by subject, text or grade. You can also generate your own
            and save it to{' '}
            <strong className="text-foreground">My prompts</strong>.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'steps',
            'A student moves through the Tutor’s steps beside their draft: Pre-writing, Thesis Statement, Introduction Paragraph, Body Paragraphs, Conclusion Paragraph, Title Your Essay and Review my Essay. Each opens with a short lesson.'
          )}
        >
          <GuideStep n={2}>Students write with the Tutor</GuideStep>
          <GuideH3>Seven steps from pre-writing to a title</GuideH3>
          <GuideCopy>
            Pre-writing, thesis, introduction, body paragraphs, conclusion,
            title and a final review. Each step starts with a short lesson from
            the Tutor.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'grade',
            'The teacher opens a submitted essay and clicks Grading Assistant Suggestions. Scores and feedback fill in, the teacher reads one rubric comment, then releases the grade.'
          )}
        >
          <GuideStep n={3}>Grade and release</GuideStep>
          <GuideH3>A suggested grade you can change</GuideH3>
          <GuideCopy>
            The Grading Assistant scores thesis, organization, evidence, voice
            and grammar and drafts feedback. Students see it only after you
            release it.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <section
        aria-labelledby="guide-tutor"
        className="flex flex-col gap-10 rounded-2xl bg-secondary p-6 md:p-10"
      >
        <div className="flex flex-col gap-3">
          <Eyebrow>The YAWP! Tutor</Eyebrow>
          <h2
            id="guide-tutor"
            className="text-2xl font-semibold leading-tight md:text-3xl"
          >
            How the Tutor works with students
          </h2>
          <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
            The Tutor reads the student’s draft and coaches them through it one
            step at a time. It asks questions, says what is working and gives
            one or two things to try next. The writing stays the student’s.
          </p>
        </div>

        <GuideRow
          media={clip(
            'feedback',
            'On the Thesis Statement step, a student taps Give me feedback! The Tutor says the thesis is strong and arguable, then suggests one thing to try: show what changes once Macbeth’s ambition has a name.'
          )}
        >
          <GuideH3>Feedback on their own draft</GuideH3>
          <GuideCopy>
            Students tap{' '}
            <strong className="text-foreground">Give me feedback!</strong> or
            ask a question whenever they want. The Tutor reads what they have
            written, starts with what works and suggests one or two next steps.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'tutor',
            'A student adds a sentence to a body paragraph and asks the Tutor to write the rest. The Tutor says that part is theirs to write and asks what Banquo notices about Macbeth.'
          )}
        >
          <GuideH3>Questions instead of answers</GuideH3>
          <GuideCopy>
            When a student asks the Tutor to write for them, it asks a
            question, offers an example on another topic or gives a sentence
            starter for them to finish.
          </GuideCopy>
        </GuideRow>

        <ul className="grid gap-4 md:grid-cols-3">
          {TUTOR_POINTS.map((point) => (
            <li
              key={point.title}
              className="flex flex-col gap-2 rounded-xl border bg-background p-5"
            >
              <GuideH3>{point.title}</GuideH3>
              <GuideCopy>{point.detail}</GuideCopy>
            </li>
          ))}
        </ul>
      </section>

      <GuideSection id="guide-cold" eyebrow="Also" title="Give a cold write">
        <GuideRow
          flip
          media={clip(
            'cold',
            'A student opens an in-class essay and starts writing. Beside the draft is only the prompt, marked as a cold write.'
          )}
        >
          <GuideCopy>
            The goal is for students to write better without the Tutor. Turn
            it off for an in-class essay and use it as a diagnostic, as an
            assessment or to track whether skills transfer.
          </GuideCopy>
        </GuideRow>

        <TransferChart />

        <GuideRow
          media={clip(
            'reporter',
            'The teacher asks Reporter how one student’s cold writes and warm writes are changing. Reporter answers with a table of six essays: Tutor-off scores rose from 58% to 74%, Tutor-on scores from 79% to 86%, and the gap narrowed from 21 points to 12.'
          )}
        >
          <GuideH3>Track the growth in Reporter</GuideH3>
          <GuideCopy>
            Reporter keeps cold writes separate from work done with the Tutor,
            so you can see whether a student’s writing on their own is catching
            up.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes. The Tutor’s replies, the Grading Assistant’s suggestions and Reporter’s answer in them were scripted for the recording. Reporter’s numbers are the demo class’s grades."
        startTo={pagePath}
        startLabel="Create an assignment"
      />
    </GuidePage>
  );
}
