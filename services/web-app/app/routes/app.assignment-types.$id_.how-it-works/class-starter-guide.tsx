/**
 * "See how it works" for Class Starter: open-ended writing to begin class,
 * graded on engagement. Every will / won't line has to hold in the code: the
 * Class Starter rubric (one Engagement category, no grammar highlighting),
 * api.domain.tutor-response (no names), api.domain.daily-pages-prompt-generator
 * (the teacher's messages only), api.domain.grade-essay-ai (runs only when the
 * teacher asks), and the release flow. See docs/how-to-guides.md.
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

const MEDIA = '/img/class-starter-guide';

const WILL = [
  'Offer 200 ready-to-use prompts.',
  'Help you draft new prompts and save them to My prompts.',
  'Let students write with the Tutor, or alone.',
  'Suggest an engagement score and a comment for you to review.',
];

const WONT = [
  'Grade grammar or mark up the writing.',
  'Send student names to the Tutor.',
  'Send student writing to the prompt generator.',
  'Grade an entry until you ask it to.',
  'Show a student a grade before you release it.',
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

export function ClassStarterGuide({ pagePath }: { pagePath: string }) {
  const strong = (text: string) => (
    <strong className="text-foreground">{text}</strong>
  );

  return (
    <GuidePage backTo={pagePath} backLabel="Back to Class Starter">
      <GuideHero
        title="Get every student writing"
        highlight="at the start of class."
        lede="Class Starter is open-ended writing to begin class. It’s graded on engagement: did the student write, and did they reflect?"
        image={{
          src: `${MEDIA}/hero.jpg`,
          alt: 'The Generate a prompt panel. The teacher asked for a playful warm-up about identity for 10th graders, and the assistant offers three options, starting with: Name one thing you do every day that says something true about who you are.',
          width: 672,
          height: 560,
          caption: 'Drafting a Class Starter prompt',
        }}
      />

      <GuideSection
        id="guide-library"
        eyebrow="What it can do"
        title="Prompts for any class"
      >
        <GuideRow
          media={
            <GuideImage
              src={`${MEDIA}/library.jpg`}
              alt="The Class Starter Prompt Library: filters for collection, text, theme, cognitive move, and type, beside prompts such as I am the captain of my destiny. Agree or disagree and explain your rationale."
              width={822}
              height={640}
            />
          }
        >
          <GuideCopy>
            Start from the library, or have the prompt generator draft one with
            you.
          </GuideCopy>
          <GuideList
            testId="guide-prompts"
            items={[
              <>
                {strong('Prompt Library:')} 200 prompts you can filter by type,
                theme, text, and grade band.
              </>,
              <>
                {strong('Generate a prompt:')} describe what you want, and it
                drafts three options.
              </>,
              <>
                {strong('My prompts:')} every prompt you save or use, in one
                place.
              </>,
            ]}
          />
        </GuideRow>
      </GuideSection>

      <GuideSection
        id="guide-assign"
        eyebrow="Class Starter"
        title="Start class with writing"
      >
        <GuideRow
          media={clip(
            'generate',
            'The teacher opens New, then Generate a prompt, and asks for a playful warm-up about identity for 10th graders. The assistant drafts three options. The teacher picks the second, clicks Use this prompt, chooses English 10 Period 2, and creates the assignment.'
          )}
        >
          <GuideStep n={1}>Pick a prompt</GuideStep>
          <GuideH3>Find one, or draft one</GuideH3>
          <GuideCopy>
            Click a prompt in the library, or open {strong('Generate a prompt')}{' '}
            and describe what you want. Use a prompt, and it opens the New
            Assignment form.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          flip
          media={clip(
            'write',
            'A student opens Identity warm-up from her class page, writes about a label people gave her, and submits it.'
          )}
        >
          <GuideStep n={2}>Students write</GuideStep>
          <GuideH3>Open-ended writing</GuideH3>
          <GuideCopy>
            Students write freely in response to your prompt and submit.
          </GuideCopy>
        </GuideRow>

        <GuideRow
          media={clip(
            'grade',
            'The teacher opens the student’s writing and clicks Grading Assistant Suggestions. It suggests All in, 3 out of 3, with an overall comment.'
          )}
        >
          <GuideStep n={3}>Grade and release</GuideStep>
          <GuideH3>Graded on engagement</GuideH3>
          <GuideCopy>
            Click {strong('Grading Assistant Suggestions')}. It suggests one of
            four levels, Absent, Hardly there, Showed up, or All in, with a
            comment. Change anything, then release.
          </GuideCopy>
        </GuideRow>

        <div className="flex flex-col gap-3 rounded-xl border bg-background p-5 md:p-6">
          <GuideH3>Where teachers use it</GuideH3>
          <GuideList
            testId="guide-uses"
            items={[
              <>
                {strong('The first minutes of class:')} everyone settles in and
                writes.
              </>,
              <>
                {strong('Before a discussion:')} students come to it with
                something to say.
              </>,
              <>
                {strong('To open a unit:')} find out what students already think
                about its big question.
              </>,
              <>
                {strong('Building a habit:')} short, regular writing that
                students get credit for doing.
              </>,
            ]}
          />
        </div>
      </GuideSection>

      <GuideSection
        id="guide-saved"
        eyebrow="Your prompts"
        title="Keep the prompts you like"
      >
        <GuideRow
          flip
          media={clip(
            'library',
            'The teacher opens the Prompt Library, scrolls through the prompts, and checks My prompts to see the prompt she used earlier.'
          )}
        >
          <GuideCopy>
            Every prompt you save or use shows up under {strong('My prompts')}{' '}
            in the Prompt Library.
          </GuideCopy>
        </GuideRow>
      </GuideSection>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="Clips use demo classes. The prompt generator’s reply and the Grading Assistant’s suggestion in them were scripted for the recording."
        startTo={pagePath}
        startLabel="Go to Class Starter"
      />
    </GuidePage>
  );
}
