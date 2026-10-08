/**
 * "See how it works" for Daily Pages: short academic paragraph practice,
 * graded on the short-form rubric. Every will / won't line has to hold in the
 * code: api.domain.tutor-response (no names, off when the Tutor is off),
 * api.domain.grade-essay-ai (runs only when the teacher asks), the grammar
 * toggle, and the release flow. See docs/how-to-guides.md.
 *
 * Writing time and paragraph type are left out: both sit behind a flag that is
 * off by default.
 */
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

const MEDIA = '/img/daily-pages-guide';

const WILL = [
  'Offer a library of paragraph prompts, from close reading to defining a term.',
  'Let students write with the Tutor, or alone for a cold write.',
  'Suggest a score and feedback in five categories for you to review.',
  'Mark grammar and syntax in the writing, unless you turn it off.',
];

const WONT = [
  'Send student names to the Tutor.',
  'Grade an entry until you ask it to.',
  'Show a student a grade before you release it.',
  'Grade grammar when you turn grammar grading off.',
  'Show students the Tutor when you turn it off.',
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

export function DailyPagesGuide({ pagePath }: { pagePath: string }) {
  const strong = (text: string) => (
    <strong className="text-foreground">{text}</strong>
  );

  return (
    <GuidePage backTo={pagePath} backLabel="Back to Daily Pages">
      <GuideHero
        title="Short paragraphs that build"
        highlight="real thinking."
        lede="Daily Pages is short academic paragraph practice. Each prompt asks for one move, like close-reading a passage or defending a claim, and the Grading Assistant scores it the way an essay is scored, at a fraction of the length."
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'A Daily Pages paragraph about what ambition costs Macbeth, graded 77 out of 100. The Grading Assistant’s overall feedback and a Strong score for Depth of Thought sit beside the paragraph, where a comma splice is marked.',
          width: 1120,
          height: 700,
          caption: 'A graded Daily Pages entry in English 10',
        }}
      />

      <GuideSection
        id="guide-library"
        eyebrow="What it can do"
        title="Paragraph prompts, ready to assign"
      >
        <GuideRow
          media={
            <GuideImage
              src={`${MEDIA}/library.jpg`}
              alt="The Daily Pages Prompt Library: filters for collection, source text, and kind on the left, and prompt cards such as What the narrator won’t say and The sentence that changes the rest."
              width={822}
              height={629}
            />
          }
        >
          <GuideCopy>
            The Prompt Library has 31 prompts in five kinds. Filter by kind,
            length, or whether students need a text in front of them.
          </GuideCopy>
          <GuideList
            testId="guide-kinds"
            items={[
              <>{strong('Close-read a passage:')} quote it and explain it.</>,
              <>
                {strong('Claim and defend:')} take a position and back it up.
              </>,
              <>
                {strong('Two things, one difference:')} name the difference that
                matters.
              </>,
              <>
                {strong('Evaluate a choice:')} judge a decision by a stated
                standard.
              </>,
              <>{strong('Define precisely:')} draw the line, then test it.</>,
            ]}
          />
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-assign"
        eyebrow="Daily Pages"
        title="Assign a paragraph, then grade it like an essay"
      >
        <GuideRow
          media={clip(
            'assign',
            'The teacher searches the Prompt Library for ambition and clicks What ambition costs. The New Assignment form opens with the prompt filled in, and the teacher picks English 10 Period 2, adds a title, and clicks Create Assignment. Tutor enabled and Grade this for grammar and syntax are both on.'
          )}
        >
          <GuideStep n={1}>Pick a prompt</GuideStep>
          <GuideH3>Choose a prompt and a class</GuideH3>
          <GuideCopy>
            Click any prompt to start an assignment, or write your own. Turn the
            Tutor off for a cold write, or turn grammar grading off to grade the
            thinking alone.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'write',
            'A student opens What ambition costs from her class page, writes one paragraph about Macbeth beneath the prompt, and submits it.'
          )}
        >
          <GuideStep n={2}>Students write</GuideStep>
          <GuideH3>One paragraph, one move</GuideH3>
          <GuideCopy>
            Students write beneath your prompt and submit when they’re done.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'grade',
            'The teacher opens the student’s paragraph and clicks Grading Assistant Suggestions. Scores fill in for Depth of Thought, Development of Thought, Organization/Structure, Voice/Style, and Grammar/Syntax/Mechanics, with an overall comment, and a comma splice is marked in the paragraph.'
          )}
        >
          <GuideStep n={3}>Grade and release</GuideStep>
          <GuideH3>Scores and feedback in five categories</GuideH3>
          <GuideCopy>
            Click {strong('Grading Assistant Suggestions')} for a score and
            feedback in depth of thought, development, organization, voice, and
            grammar. Change anything you disagree with, then release.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3 rounded-xl border bg-background p-5 md:p-6">
          <GuideH3>Where teachers use it</GuideH3>
          <GuideList
            testId="guide-uses"
            items={[
              <>
                {strong('A few times a week:')} a regular paragraph at the start
                or end of class.
              </>,
              <>
                {strong('Before an essay:')} practice the one move the essay
                will need.
              </>,
              <>
                {strong('After a reading:')} close-read a passage while it’s
                fresh.
              </>,
              <>
                {strong('As a cold write:')} turn the Tutor off and see what
                students can do alone.
              </>,
            ]}
          />
        </div>
      </GuideSection>

      <GuideSection
        id="guide-own"
        eyebrow="Your own prompts"
        title="Write prompts that grade well"
      >
        <GuideRow
          flip
          media={clip(
            'own',
            'The teacher opens Writing your own prompt in the About Daily Pages panel, which lists three parts of a prompt that grades well and shows prompts before and after.'
          )}
        >
          <GuideCopy>
            The {strong('About Daily Pages')} panel shows how to write your own
            prompt, with before-and-after examples.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes. The Grading Assistant’s suggestions in them were scripted for the recording."
        startTo={pagePath}
        startLabel="Go to Daily Pages"
      />
    </GuidePage>
  );
}
