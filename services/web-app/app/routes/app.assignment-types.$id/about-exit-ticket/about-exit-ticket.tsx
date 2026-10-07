import type { ReactNode } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import {
  EXIT_TICKET_FOCUS_OPTIONS,
  EXIT_TICKET_REFLECTION_PROMPT_OPTIONS,
} from '~/domain/assignment-types/exit-ticket';
import { EXIT_TICKET_SCORE_BANDS } from '~/domain/assignment-types/exit-ticket-rubric';

import {
  ABOUT_HEADING,
  ABOUT_LEDE,
  DESIRED_RESPONSE_DETAIL,
  DESIRED_RESPONSE_LEAD,
  FOCUS_INTRO,
  QUICK_BUILDER_COPY,
  GOOD_TICKET_HEADING,
  SCORING_HEADING,
  SCORING_INTRO,
  SCORING_MODES,
  SCORING_SCALE_NOTE,
  TELL_US_BASIC_NO_NOTES_DETAIL,
  TELL_US_BASIC_NO_NOTES_LEAD,
  TELL_US_BLANK_IS_A_CHOICE,
  TELL_US_HEADING,
  TELL_US_INTRO,
  TUTOR_BEHAVIOUR,
  TUTOR_BEHAVIOUR_LEAD,
  TUTOR_HEADING,
  TUTOR_NOTE,
  TUTOR_TRADE,
  TUTOR_WHY_ON,
  TUTOR_WHY_ON_LEAD,
  TWO_WAYS,
  TWO_WAYS_HEADING,
  TWO_WAYS_INTRO,
  WHAT_MAKES_A_GOOD_ONE,
} from './content';

/**
 * One collapsed section. `value` is the accordion key and has to stay stable —
 * it is what a teacher's open/closed state is keyed on within a visit.
 */
function AboutSection({
  value,
  heading,
  children,
}: {
  value: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-b last:border-b-0">
      <AccordionTrigger className="py-3 text-left text-sm font-semibold">
        {heading}
      </AccordionTrigger>
      <AccordionContent className="pb-4 pt-0">{children}</AccordionContent>
    </AccordionItem>
  );
}

/**
 * What a teacher reads on the Exit Ticket page before they make one.
 *
 * The copy has to make a pedagogical case, not just explain a mechanic: an
 * exit ticket only works if the teacher understands what it is for — a
 * five-minute check that changes tomorrow, not a quiz and not a journal. That
 * case takes a page and a half, which as one block of prose meant the whole
 * thing went unread and the form got filled in by guesswork.
 *
 * So only the blurb is open. It answers "what is this" for a teacher who has
 * never seen the type, and everything under it is a question they come back
 * with later — how to write one, what the notes buy, how it scores, what
 * makes a good one — collapsed until they ask it. Same shape as the Daily
 * Pages about section, and for the same reason.
 *
 * `type="multiple"` because these get compared rather than browsed: the score
 * bands and the form's questions want to be open at the same time, and the
 * notes section is the one people reread while filling the form in.
 */
export function AboutExitTicket() {
  const quick = true;
  const twoWaysIntro = quick ? QUICK_BUILDER_COPY.twoWaysIntro : TWO_WAYS_INTRO;
  const twoWays = quick ? QUICK_BUILDER_COPY.twoWays : TWO_WAYS;
  const focusIntro = quick ? QUICK_BUILDER_COPY.focusIntro : FOCUS_INTRO;
  const desiredResponseLead = quick
    ? QUICK_BUILDER_COPY.desiredResponseLead
    : DESIRED_RESPONSE_LEAD;
  const basicNoNotesLead = quick
    ? QUICK_BUILDER_COPY.basicNoNotesLead
    : TELL_US_BASIC_NO_NOTES_LEAD;
  const scoringIntro = quick ? QUICK_BUILDER_COPY.scoringIntro : SCORING_INTRO;
  const scoringModes = quick ? QUICK_BUILDER_COPY.scoringModes : SCORING_MODES;

  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h2 className="text-base font-semibold">{ABOUT_HEADING}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{ABOUT_LEDE}</p>

      <Accordion type="multiple" className="mt-3">
        <AboutSection value="two-ways" heading={TWO_WAYS_HEADING}>
          <p className="mb-2 text-sm text-muted-foreground">{twoWaysIntro}</p>
          <ul className="space-y-2 text-sm text-foreground/80">
            {twoWays.map((way) => (
              <li key={way.mode}>
                <span className="font-medium">{way.mode}</span> —{' '}
                <span className="text-muted-foreground">{way.detail}</span>
              </li>
            ))}
          </ul>
          {quick ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {QUICK_BUILDER_COPY.reflectionIntro}{' '}
              {EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.map((option) =>
                option.label.toLowerCase()
              )
                .join(', ')
                .replace(/, ([^,]*)$/, ', or $1')}
              .
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            {focusIntro}{' '}
            {EXIT_TICKET_FOCUS_OPTIONS.map((option) =>
              option.label.toLowerCase()
            )
              .join(', ')
              .replace(/, ([^,]*)$/, ', or $1')}
            .
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {desiredResponseLead}
            </span>{' '}
            {DESIRED_RESPONSE_DETAIL}
          </p>
        </AboutSection>

        <AboutSection value="tell-us" heading={TELL_US_HEADING}>
          <p className="text-sm text-muted-foreground">{TELL_US_INTRO}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {TELL_US_BLANK_IS_A_CHOICE}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {basicNoNotesLead}
            </span>{' '}
            {TELL_US_BASIC_NO_NOTES_DETAIL}
          </p>
        </AboutSection>

        <AboutSection value="scoring" heading={SCORING_HEADING}>
          <p className="text-sm text-muted-foreground">{scoringIntro}</p>
          <dl className="mt-2 space-y-1.5 text-sm text-foreground/80">
            {scoringModes.map((mode) => (
              <div key={mode.label}>
                <dt className="inline font-medium">{mode.label} </dt>
                <dd className="inline text-muted-foreground">{mode.detail}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 space-y-2 text-sm text-foreground/80">
            {EXIT_TICKET_SCORE_BANDS.map((band) => (
              <li key={band.label}>
                <span className="font-medium">{band.label}</span>{' '}
                <span className="text-muted-foreground">
                  (
                  {band.min === band.max ? band.min : `${band.min}–${band.max}`}
                  )
                </span>{' '}
                — {band.description}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            {SCORING_SCALE_NOTE}
          </p>
        </AboutSection>

        <AboutSection
          value="what-makes-a-good-one"
          heading={GOOD_TICKET_HEADING}
        >
          <ul className="space-y-2 text-sm text-foreground/80">
            {WHAT_MAKES_A_GOOD_ONE.map((item) => (
              <li key={item.title}>
                <span className="font-medium">{item.title}</span> —{' '}
                <span className="text-muted-foreground">{item.detail}</span>
              </li>
            ))}
          </ul>
        </AboutSection>

        <AboutSection value="tutor" heading={TUTOR_HEADING}>
          <p className="text-sm text-muted-foreground">{TUTOR_NOTE}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {TUTOR_WHY_ON_LEAD}
            </span>{' '}
            {TUTOR_WHY_ON}
          </p>
          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {TUTOR_BEHAVIOUR_LEAD}
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/80">
            {TUTOR_BEHAVIOUR.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{TUTOR_TRADE}</p>
        </AboutSection>
      </Accordion>
    </section>
  );
}
