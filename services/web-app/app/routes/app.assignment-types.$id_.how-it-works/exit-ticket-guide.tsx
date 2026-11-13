/**
 * "See how it works" for Exit Ticket (Kevin, Nov 10): the fourth of the
 * assignment-type guides, behind `assignment-type-landing-v2` with Brian's
 * landing pages. Same order as the other three: the overview video, How to
 * Teach It, the three beats, Brian's "What makes a good exit ticket", and the
 * will / won't.
 *
 * Every will / won't line has to hold in the code (docs/how-to-guides.md):
 * - Tutor off by default: EXIT_TICKET_TUTOR_ENABLED_DEFAULT (exit-ticket.ts).
 * - Ungraded unless the teacher grades it: the builder's "Grade this ticket"
 *   starts unchecked (assignment-creation-sheet.tsx, exit-ticket-builder.tsx).
 * - No grammar, spelling or length: the rubric's grading note and
 *   grammarHighlighting: false (exit-ticket-rubric.ts).
 * - No student names to the Tutor: api.domain.tutor-response de-identifies.
 * - No grade before release: the release flow, as for every type.
 */
import {
  GuideCard,
  GuideCopy,
  GuideFooter,
  GuideH3,
  GuideHero,
  GuidePage,
  GuidePanel,
  GuideSection,
  GuideStep,
  WillWont,
} from '~/components/how-it-works/guide';
import { guideAccentFor } from '~/components/how-it-works/guide-accents';
import { RichText } from '../app.assignment-types.$id/landing-copy/assignment-type-landing';
import { LANDING_PAGES } from '../app.assignment-types.$id/landing-copy/content';
import { GuideHowToTeach } from './guide-how-to-teach';
import { GUIDE_OVERVIEW_VIDEOS } from './overview-videos';

const STEPS = [
  {
    title: 'Make the ticket',
    detail:
      'Choose Reflection/Question, or Check for understanding. For a check, name the idea you taught and, if you like, the correct answer or key points.',
  },
  {
    title: 'Students answer',
    detail:
      'In the last few minutes of class, students answer in their own words. The Tutor stays off unless you turn it on.',
  },
  {
    title: 'Read them',
    detail:
      'Read the answers before you plan tomorrow. Grade the ticket only if you want it in the gradebook.',
  },
];

const WILL = [
  'Ask a reflection question, or check one idea you taught.',
  'Start with the Tutor off, so you see what students understand on their own.',
  'Leave it ungraded unless you choose to grade it.',
  'When you grade it, suggest a score and a comment for you to review.',
];

const WONT = [
  'Grade grammar, spelling, or length.',
  'Send student names to the Tutor.',
  'Show a student a grade before you release it.',
];

/** Brian's "What makes a good exit ticket": each bullet's bold lead, then the rest. */
function goodTicketTips(): { lead: string; rest: string }[] {
  const section = LANDING_PAGES['exit-ticket'].sections.find(
    (s) => s.id === 'what-makes-a-good-one'
  );
  const bullets = section?.blocks.find((b) => b.type === 'bullets');
  if (!bullets || bullets.type !== 'bullets') return [];
  return bullets.items.map((item) => {
    const match = /^\*\*([^*]+)\*\*\s*(.*)$/.exec(item);
    return match ? { lead: match[1]!, rest: match[2]! } : { lead: '', rest: item };
  });
}

export function ExitTicketGuide({ pagePath }: { pagePath: string }) {
  return (
    <GuidePage
      backTo={pagePath}
      backLabel="Back to Exit Ticket"
      accent={guideAccentFor('exit-ticket')}
    >
      <GuideHero
        title="Find out if today’s lesson"
        highlight="landed."
        lede="A few minutes at the end of class for students to show they understand a concept, reflect on what you just did, or ask a lingering question. Use their answers to plan your next lesson."
        video={GUIDE_OVERVIEW_VIDEOS['exit-ticket']}
      />

      <GuideHowToTeach guideKey="exit-ticket" />

      <GuideSection
        id="guide-how"
        eyebrow="How it works"
        title="One question at the end of class"
      >
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2">
              <GuideStep n={i + 1}>{step.title}</GuideStep>
              <GuideCopy>{step.detail}</GuideCopy>
            </li>
          ))}
        </ol>
      </GuideSection>

      <GuidePanel
        id="guide-good-ticket"
        eyebrow="Bonus tip"
        title="What makes a good exit ticket"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {goodTicketTips().map((tip) => (
            <GuideCard key={tip.lead}>
              <GuideH3>{tip.lead}</GuideH3>
              <GuideCopy>
                <RichText text={tip.rest} />
              </GuideCopy>
            </GuideCard>
          ))}
        </div>
      </GuidePanel>

      <WillWont will={WILL} wont={WONT} />

      <GuideFooter
        note="The video uses demo classes."
        startTo={pagePath}
        startLabel="Go to Exit Ticket"
      />
    </GuidePage>
  );
}
