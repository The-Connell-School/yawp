/**
 * "See how it works": a short, teacher-facing tour of The Thesis-Driven Essay.
 *
 * The cadence leads: the teacher teaches a step from the course, then students
 * write that step with the Tutor, which reinforces the lesson. It says what
 * the essay does in a line or two per step and lets a clip show the rest. The will / won't section is written for the reader deciding
 * whether to allow it, so every line there has to hold in the code: the
 * Tutor's module instructions, api.domain.tutor-response, the grade release
 * route and the paste report. See docs/how-to-guides.md.
 *
 * The clips were recorded in YAWP! with demo classes and live in
 * public/img/thesis-essay-guide, so the page reaches no outside site.
 */
import { Link, redirect, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { FileText, Presentation } from 'lucide-react';
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
      ? [
          {
            organizationId: profile.organization.id,
            teacherProfileId: profile.id,
          },
        ]
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

  // The course that teaches teachers the process. It is linked only when this
  // teacher can open it, by the same rule as the Teacher Training page.
  const assigned = await prisma.orgMembership.findUnique({
    where: { id: profile.id, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const course = await prisma.teacherTraining.findFirst({
    where: {
      title: { equals: COURSE_TITLE, mode: 'insensitive' },
      ...((assigned?._count.assignedTeacherTrainings ?? 0) > 0
        ? { assignedTeachers: { some: { id: profile.id } } }
        : {}),
    },
    select: { id: true },
  });

  return {
    pagePath,
    coursePath: course ? `/app/teacher-trainings/${course.id}` : null,
  };
}

const COURSE_TITLE = 'The Thesis-Driven Essay';

// The course's lessons, in order, with the materials each one comes with.
// The Tutor's steps follow the same order.
const LESSONS = [
  { title: 'Introduce students to YAWP!', plan: true, deck: true },
  { title: 'Pre-writing', plan: true, deck: true },
  { title: 'Developing a thesis statement', plan: true, deck: true },
  { title: 'Introduction paragraph', plan: true, deck: true },
  { title: 'Body paragraphs', plan: true, deck: true },
  { title: 'The conclusion', plan: true, deck: true },
  { title: 'Titling your essay', plan: false, deck: true },
  { title: 'Review my essay', plan: false, deck: false },
];

const TUTOR_POINTS = [
  {
    title: 'Support for every student',
    detail:
      'Every student gets immediate feedback on their own draft while they write. It’s like having a TA on every document: a level of feedback one teacher could never give a whole class alone.',
  },
  {
    title: 'Keeps them on the essay',
    detail: 'Off-topic questions get a friendly nudge back to the writing.',
  },
  {
    title: 'Keeps them thinking',
    detail:
      'Its questions and next steps leave the thinking to the student, from the first idea to the final draft.',
  },
];

const GRADING_POINTS = [
  {
    title: 'What it is',
    detail:
      'A consistent and fair evaluation of every essay against the same rubric, at the level you set for the assignment: beginner, intermediate or advanced.',
  },
  {
    title: 'What it isn’t',
    detail:
      'The final grade. Students see nothing until you release it, and it never accuses a student of cheating or of using AI.',
  },
  {
    title: 'Why we use it',
    detail:
      'It cuts grading time from weeks to a day. Students get feedback while the essay is still fresh, which keeps their momentum and makes them want to revise.',
  },
];

const WILL = [
  'Support students through each step of the essay-writing process.',
  'Ask questions and give feedback on the student’s own draft.',
  'Show you a copy-paste alert for any text pasted from outside of YAWP!',
  'Let you give a cold write with the Tutor off.',
  'Fully grade essays with a score and feedback for you to review.',
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
  const { pagePath, coursePath } = useLoaderData<typeof loader>();

  return (
    <GuidePage backTo={pagePath} backLabel="Back to The Thesis-Driven Essay">
      <GuideHero
        title="Teach the thesis-driven essay"
        highlight="one step at a time."
        lede="A full curriculum for teaching the critical essay, in a process students enjoy. You teach each step. Then students write that step with the YAWP! Tutor, which reinforces the day’s lesson."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A student’s Macbeth essay beside the YAWP! Tutor. The student has asked the Tutor to write the rest of a paragraph, and the Tutor answers that the paragraph is theirs to write and asks what Banquo notices about Macbeth.',
          width: 1120,
          height: 700,
          caption: 'The Tutor on a body paragraph about Macbeth',
        }}
      />

      <GuideSection
        id="guide-what"
        eyebrow="The assignment"
        title="The essay that stands up in any high school or college classroom"
      >
        <GuideCopy>
          The five-paragraph essay is where younger writers start. The
          thesis-driven essay is what comes next: the more complex, grown-up
          critical essay, and YAWP!’s flagship assignment. Whether you already
          teach it or have only taught the five-paragraph essay, you get the
          curriculum and the process to teach it well.
        </GuideCopy>
      </GuideSection>

      <GuideSection
        id="guide-how"
        eyebrow="How it works"
        title="Teach it, step by step"
      >
        <GuideCopy>
          This isn’t an online course students work through on their own. You
          teach the thesis-driven essay one step at a time, and the Tutor
          reinforces what you taught.
        </GuideCopy>

        <GuideRow
          media={clip(
            'prompts',
            'The teacher opens the Prompt Library, searches for Macbeth and picks the prompt. It opens in the New Assignment sheet, where the teacher chooses English 10, adds a title and creates the assignment.'
          )}
        >
          <GuideStep n={1}>The teacher creates the assignment</GuideStep>
          <GuideH3>Pick a prompt or assign your own</GuideH3>
          <GuideCopy>
            Choose from 100 essay prompts, searchable by subject, text or grade,
            or write your own. When you assign it you set the due date, the
            points, the time limit and whether the Tutor and grammar grading are
            on.
          </GuideCopy>
        </GuideRow>

        <GuideRow flip media={<LessonList />}>
          <GuideStep n={2}>You teach the process</GuideStep>
          <GuideH3>A full curriculum, ready to teach</GuideH3>
          <GuideCopy>
            Eight lessons with lesson plans, slide decks, handouts and sample
            essays walk your class through pre-writing, a strong thesis
            statement and how to organize the essay. A short video for you comes
            with each one, so you learn how to teach it, too.
          </GuideCopy>
          {coursePath ? (
            <Link
              to={coursePath}
              className="text-[15px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Open the course
            </Link>
          ) : null}
        </GuideRow>

        <GuideRow
          media={clip(
            'steps',
            'A student moves through the Tutor’s steps beside their draft: Pre-writing, Thesis Statement, Introduction Paragraph, Body Paragraphs, Conclusion Paragraph, Title Your Essay and Review my Essay. Each opens with a short lesson.'
          )}
        >
          <GuideStep n={3}>Students write alongside the Tutor</GuideStep>
          <GuideH3>Each day’s lesson, put to work</GuideH3>
          <GuideCopy>
            After the lesson, students open their essay and write that part of
            it with the Tutor beside them. The Tutor’s steps follow the same
            order as the lessons.
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
            The Tutor gives feedback aligned to the curriculum, designed to
            deepen students’ thinking so they develop their own ideas. Its
            cardinal rule: it won’t write for the student, even when a student
            asks it to.
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
            ask a question whenever they want. The Tutor reads what they’ve
            written and responds the way a great writing teacher would:
            encouraging feedback and one or two next steps.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'tutor',
            'A student adds a sentence to a body paragraph and asks the Tutor to write the rest. The Tutor says that part is theirs to write and asks what Banquo notices about Macbeth.'
          )}
        >
          <GuideH3>The refusal is the point</GuideH3>
          <GuideCopy>
            When a student asks the Tutor to write for them, it refuses.
            Instead, it challenges them with questions designed to deepen their
            thinking, so they can develop original ideas.
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

      <section
        aria-labelledby="guide-grading"
        className="flex flex-col gap-10 rounded-2xl bg-secondary p-6 md:p-10"
      >
        <div className="flex flex-col gap-3">
          <Eyebrow>Grade and release</Eyebrow>
          <h2
            id="guide-grading"
            className="text-2xl font-semibold leading-tight md:text-3xl"
          >
            Students submit, and the Grading Assistant helps you grade
          </h2>
          <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
            The Grading Assistant reads each essay against the rubric and drafts
            scores and feedback. You read it, change what you disagree with and
            decide when students see it. Every grade is yours.
          </p>
        </div>

        <GuideRow
          media={clip(
            'grade',
            'The teacher opens a submitted essay and clicks Grading Assistant Suggestions. Scores and feedback fill in, the teacher reads one rubric comment, then releases the grade.'
          )}
        >
          <GuideH3>A fully graded essay you can edit</GuideH3>
          <GuideCopy>
            Click{' '}
            <strong className="text-foreground">
              Grading Assistant Suggestions
            </strong>{' '}
            and it scores thesis, organization, evidence, voice and grammar,
            with a comment for each. Change any score or comment, then release
            the grade when you are ready.
          </GuideCopy>
        </GuideRow>

        <ul className="grid gap-4 md:grid-cols-3">
          {GRADING_POINTS.map((point) => (
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

      <GuideSection
        id="guide-cold"
        eyebrow="Bonus tip"
        title="Use the thesis-driven essay to track student progress"
      >
        <GuideRow
          flip
          media={clip(
            'cold',
            'A student opens an in-class essay and starts writing. Beside the draft is only the prompt, marked as a cold write.'
          )}
        >
          <GuideStep n={1}>Start the year with a cold write</GuideStep>
          <GuideH3>An in-class essay with the Tutor off</GuideH3>
          <GuideCopy>
            The goal is for students to write better without the Tutor. Give an
            in-class essay with the Tutor turned off at the start of the year
            and use it as a diagnostic.
          </GuideCopy>
        </GuideRow>

        <GuideRow media={<TransferChart />}>
          <GuideStep n={2}>Teach, then cold write again</GuideStep>
          <GuideH3>Watch the gap close</GuideH3>
          <GuideCopy>
            Teach the thesis-driven essay with the Tutor through the semester,
            then give another cold write. As the skills become their own,
            students’ cold writes rise toward their work with the Tutor and the
            gap narrows.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'reporter',
            'The teacher asks Reporter how one student’s cold writes and warm writes are changing. Reporter answers with a table of six essays: Tutor-off scores rose from 58% to 74%, Tutor-on scores from 79% to 86%, and the gap narrowed from 21 points to 12.'
          )}
        >
          <GuideH3>See the growth in Reporter</GuideH3>
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

/** The course's lessons, standing in for a clip on the "you teach" step. */
function LessonList() {
  return (
    <div className="rounded-xl border bg-background p-5 shadow-sm">
      <p className="mb-3 text-[15px] font-semibold">
        The Thesis-Driven Essay course
      </p>
      <ol className="flex flex-col divide-y">
        {LESSONS.map((lesson, i) => (
          <li
            key={lesson.title}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"
          >
            <span>
              <span className="mr-2 tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              {lesson.title}
            </span>
            <span className="inline-flex gap-3 text-xs text-muted-foreground">
              {lesson.plan ? (
                <span className="inline-flex items-center gap-1">
                  <FileText size={12} aria-hidden="true" />
                  Lesson plan
                </span>
              ) : null}
              {lesson.deck ? (
                <span className="inline-flex items-center gap-1">
                  <Presentation size={12} aria-hidden="true" />
                  Slide deck
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
