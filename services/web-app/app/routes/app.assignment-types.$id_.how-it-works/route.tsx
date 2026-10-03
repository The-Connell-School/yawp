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
          alt: 'A student’s essay draft beside the YAWP! Tutor, which is asking a question about the student’s thesis.',
          width: 1120,
          height: 700,
          caption: 'A student drafting a thesis with the Tutor',
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
            'The teacher searches the prompt library, filters by category and picks a prompt. It opens in the Create Assignment sheet.'
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
            'tutor',
            'A student writes a body paragraph. The Tutor answers a question about the draft with a question of its own.'
          )}
        >
          <GuideStep n={2}>Students write with the Tutor</GuideStep>
          <GuideH3>Seven steps from pre-writing to a title</GuideH3>
          <GuideCopy>
            The Tutor asks questions and gives feedback on each part of the
            essay. It won’t write the essay for them.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'grade',
            'The teacher opens a submitted essay, runs the Grading Assistant, reads the suggested scores and feedback, then releases the grade.'
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

      <GuideSection id="guide-cold" eyebrow="Also" title="Give a cold write">
        <GuideRow
          flip
          media={clip(
            'cold',
            'A student writes with the Tutor turned off. Beside the draft is only the assignment prompt, marked as a cold write.'
          )}
        >
          <GuideCopy>
            Turn the Tutor off for an in-class essay. Students see only the
            prompt.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes."
        startTo={pagePath}
        startLabel="Create an assignment"
      />
    </GuidePage>
  );
}
