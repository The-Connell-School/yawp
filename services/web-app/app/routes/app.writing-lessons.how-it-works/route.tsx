/**
 * "See how it works": a short, teacher-facing tour of Writing Practice.
 *
 * It says what Writing Practice does in a line or two per step and lets a clip
 * show the rest. The will / won't section is written for the reader deciding
 * whether to allow it, so every line there has to hold in
 * utils/writing-lessons (the Tutor's prompt in practice-feedback.server.ts,
 * what the assigned and self-directed practice routes save). See
 * docs/how-to-guides.md.
 *
 * The clips were recorded with demo classes and live in
 * public/img/writing-practice-guide, so the page reaches no outside site.
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
import { requireMembership, requireUserId } from '~/utils/auth.server';

const MEDIA = '/img/writing-practice-guide';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  // The guide is about assigning practice; students have their own intro on
  // the Writing Practice page.
  if (profile.role !== 'TEACHER') throw redirect('/app/writing-lessons');
  return null;
}

const WILL = [
  'Teach short lessons on grammar, sentence structure, and composition.',
  'Give students feedback on every problem as they work.',
  'Coach students as they revise their own writing.',
  'Show you each student’s answers, drafts, and progress.',
  'Show which questions your classes miss most.',
];

const WONT = [
  'Write a student’s revision for them.',
  'Send student names to the AI.',
  'Count toward grades. It’s practice.',
  'Send you practice a student gives themselves.',
  'Show students anyone else’s work.',
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

export default function WritingPracticeHowItWorksRoute() {
  const strong = (text: string) => (
    <strong className="text-foreground">{text}</strong>
  );

  return (
    <GuidePage
      backTo="/app/writing-lessons"
      backLabel="Back to Writing Practice"
    >
      <GuideHero
        title="Short lessons that sharpen"
        highlight="student writing."
        lede="Writing Practice has 16 quick lessons on grammar, sentence structure, and composition. Assign a set, and every student gets feedback on every problem."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A student’s two drafts on an evidence problem. The first gets Keep revising with hints; the second cites the American Academy of Pediatrics and gets Strong work.',
          width: 868,
          height: 700,
          caption: 'A student revising an evidence problem',
        }}
      />

      <GuideSection
        id="guide-lessons"
        eyebrow="What it can do"
        title="16 lessons, ready to assign"
      >
        <GuideRow
          media={
            <GuideImage
              src={`${MEDIA}/lessons.jpg`}
              alt="Lesson cards in two sections. Grammar & Mechanics: Fixing Comma Splices, The Oxford Comma, and Commas: Sentences with Independent and Dependent Clauses. Composition: Topic Sentences, Thesis Statements, Evidence, Analysis, Hooks & Openings, and Conclusions."
              width={868}
              height={655}
            />
          }
        >
          <GuideCopy>
            Every lesson starts with a short explanation and examples, then
            practice problems.
          </GuideCopy>
          <GuideList
            testId="guide-lessons"
            items={[
              <>
                {strong('Grammar & Mechanics:')} 10 lessons, from comma splices
                to passive voice. Students answer ACT-style multiple-choice
                problems.
              </>,
              <>
                {strong('Composition:')} 6 lessons on topic sentences, thesis
                statements, evidence, analysis, openings, and conclusions.
                Students write, and the Tutor responds.
              </>,
              <>
                {strong('Mixed sets:')} pick several skills, and their problems
                are mixed into one set.
              </>,
              <>
                {strong('Practice on their own:')} students can build a set for
                themselves anytime.
              </>,
            ]}
          />
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-assign"
        eyebrow="Assigned practice"
        title="Assign practice to a class"
      >
        <GuideRow
          media={clip(
            'assign',
            'The teacher clicks Create assignment, checks Fixing Comma Splices and Evidence, names the set, picks English 10 Period 2, sets a due date and six problems, adds directions, and clicks Assign practice.'
          )}
        >
          <GuideStep n={1}>Pick the skills</GuideStep>
          <GuideH3>Choose skills, classes, and a due date</GuideH3>
          <GuideCopy>
            One skill or several, as many problems as you want, and directions
            if you like.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'practice',
            'A student picks the right answer to a comma splice question and sees why it’s right. On the next problem, she writes evidence for a claim, and the Tutor replies with what’s working and what to try next.'
          )}
        >
          <GuideStep n={2}>Students practice</GuideStep>
          <GuideH3>Feedback on every problem</GuideH3>
          <GuideCopy>
            Multiple-choice problems show the right answer and why. On written
            problems, the Tutor says what’s working and what to try next.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'results',
            'The teacher clicks View results. A list shows each student’s progress, then the teacher opens one student to see every answer and draft.'
          )}
        >
          <GuideStep n={3}>Check the results</GuideStep>
          <GuideH3>See who’s done and who’s stuck</GuideH3>
          <GuideCopy>
            Every student’s progress, answers, and drafts, in one place.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3 rounded-xl border bg-background p-5 md:p-6">
          <GuideH3>Where teachers use it</GuideH3>
          <GuideList
            testId="guide-uses"
            items={[
              <>{strong('Warm-ups:')} five problems at the start of class.</>,
              <>
                {strong('After grading essays:')} assign the skill your class
                summary says needs work.
              </>,
              <>
                {strong('Before the ACT:')} grammar problems in the test’s
                format.
              </>,
              <>
                {strong('Homework:')} a short set due before your next writing
                workshop.
              </>,
            ]}
          />
        </div>
      </GuideSection>

      <GuideSection id="guide-more" eyebrow="More" title="More ways to use it">
        <GuideRow
          flip
          media={clip(
            'revise',
            'The student rewrites her answer to cite the American Academy of Pediatrics and a 7:20 start time. The Tutor marks it Strong work, and the problem is mastered.'
          )}
        >
          <GuideH3>Students revise until they get it</GuideH3>
          <GuideCopy>
            A written problem is done when the Tutor marks it Strong work. It
            points to what to fix and doesn’t write the answer.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'lesson',
            'The teacher opens the Fixing Comma Splices lesson. Beside the lesson, How this has landed shows 18 students have practiced it, and Where they go wrong lists the questions missed most, with the answers students chose.'
          )}
        >
          <GuideH3>See how a skill has landed</GuideH3>
          <GuideCopy>
            Each lesson page shows how your classes did on that skill and the
            questions they missed most.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'own',
            'A student clicks Create practice, picks Passive Voice and Parallel Construction, chooses 10 problems, and starts. The page says nothing here is sent to the teacher.'
          )}
        >
          <GuideH3>Students can practice on their own</GuideH3>
          <GuideCopy>
            Students can build their own sets. That practice stays with them and
            isn’t sent to you.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes. The Tutor’s replies in them were scripted for the recording."
        startTo="/app/writing-lessons"
        startLabel="Go to Writing Practice"
      />
    </GuidePage>
  );
}
