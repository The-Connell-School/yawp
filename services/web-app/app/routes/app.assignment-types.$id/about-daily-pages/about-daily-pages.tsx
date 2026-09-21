import type { ReactNode } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';

import {
  SHORT_FORM_LIBRARY_HEADING,
  ShortFormTeacherDirections,
} from '../short-form-prompts-library/short-form-teacher-directions';

import {
  ABOUT_HEADING,
  ABOUT_LEDE,
  GRADING_SUMMARY,
  HOW_ITS_GRADED_HEADING,
  HOW_ITS_GRADED_INTRO,
  HOW_TO_USE,
  HOW_TO_USE_HEADING,
  PROMPT_RECIPE,
  PROMPT_RECIPE_SOURCE_NOTE,
  PROMPT_REWRITES,
  PROMPT_WARNINGS,
  PROMPT_WARNINGS_HEADING,
  REWRITE_HEADING,
  SCORE_SCALE_LABELS,
  SCORE_SCALE_NOTE,
  WHAT_IT_IS,
  WHAT_IT_IS_HEADING,
  WHAT_IT_IS_NOT,
  WHAT_IT_IS_NOT_HEADING,
  WRITE_YOUR_OWN_HEADING,
  WRITE_YOUR_OWN_INTRO,
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

/** A label above a block inside a section, below the section's own heading. */
function MinorHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * The teacher-facing explanation of the assignment type, shown above the
 * library on the Daily Pages page.
 *
 * It sits above the library directions rather than inside them because a
 * teacher's first question is what they are assigning, and their most common
 * action over a year is writing a prompt of their own — neither of which the
 * library's "browse and click" copy answers.
 *
 * Read end to end it is a page and a half, which nobody does twice. So only
 * the blurb is open: it is the one part that answers "what is this" for a
 * teacher who has never seen the type, and everything under it is a question
 * they will come back with later — how it scores, how to run it, how to write
 * a prompt, how the library works — collapsed until they ask it. The accordion
 * is `type="multiple"` because those questions are compared, not browsed: the
 * grading weights and the prompt recipe want to be open at the same time.
 *
 * The library directions are the last of those sections rather than a card of
 * their own. Two stacked explainer boxes above a prompt grid read as one wall
 * whichever order they are in, and "how to browse the corpus" is the narrowest
 * question here, not the first one.
 */
export function AboutDailyPages() {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h2 className="text-base font-semibold">{ABOUT_HEADING}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{ABOUT_LEDE}</p>

      <Accordion type="multiple" className="mt-3">
        <AboutSection value="what-it-is" heading={WHAT_IT_IS_HEADING}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
            {WHAT_IT_IS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </AboutSection>

        <AboutSection value="what-it-is-not" heading={WHAT_IT_IS_NOT_HEADING}>
          <dl className="space-y-1.5 text-sm text-foreground/80">
            {WHAT_IT_IS_NOT.map((item) => (
              <div key={item.claim}>
                <dt className="inline font-medium">{item.claim} </dt>
                <dd className="inline text-muted-foreground">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </AboutSection>

        <AboutSection value="how-its-graded" heading={HOW_ITS_GRADED_HEADING}>
          <p className="mb-3 text-sm text-muted-foreground">
            {HOW_ITS_GRADED_INTRO}
          </p>
          <table className="w-full table-fixed border-separate border-spacing-y-1 text-left text-sm">
            <caption className="sr-only">
              What each Daily Pages category is worth and what it reads
            </caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-[42%] font-medium sm:w-[30%]">
                  Category
                </th>
                <th scope="col" className="w-[16%] font-medium sm:w-[12%]">
                  Weight
                </th>
                <th scope="col" className="hidden font-medium sm:table-cell">
                  What it reads
                </th>
              </tr>
            </thead>
            <tbody className="align-top">
              {GRADING_SUMMARY.map((row) => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="pr-2 font-medium text-foreground/90"
                  >
                    {row.label}
                  </th>
                  <td className="pr-2 tabular-nums text-muted-foreground">
                    {row.weightPercent}%
                  </td>
                  <td className="text-muted-foreground">
                    <span className="sm:hidden">{row.label}: </span>
                    {row.gloss}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted-foreground">
            {SCORE_SCALE_NOTE}{' '}
            <span className="text-foreground/80">
              {SCORE_SCALE_LABELS.join(' · ')}
            </span>
          </p>
        </AboutSection>

        <AboutSection value="how-to-use" heading={HOW_TO_USE_HEADING}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
            {HOW_TO_USE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </AboutSection>

        <AboutSection value="write-your-own" heading={WRITE_YOUR_OWN_HEADING}>
          <p className="mb-3 text-sm text-muted-foreground">
            {WRITE_YOUR_OWN_INTRO}
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground/80">
            {PROMPT_RECIPE.map((part) => (
              <li key={part.move}>
                <span className="font-medium">{part.move}.</span>{' '}
                <span className="text-muted-foreground">{part.detail}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            {PROMPT_RECIPE_SOURCE_NOTE}
          </p>

          <MinorHeading>{REWRITE_HEADING}</MinorHeading>
          <ul className="space-y-3 text-sm">
            {PROMPT_REWRITES.map((rewrite) => (
              <li
                key={rewrite.before}
                className="rounded-md border border-border/60 bg-background/60 p-3"
              >
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground/70">
                    Instead of
                  </span>{' '}
                  <span className="line-through">{rewrite.before}</span>
                </p>
                <p className="mt-1 text-foreground/90">
                  <span className="font-medium text-foreground/70">Try</span>{' '}
                  {rewrite.after}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rewrite.why}
                </p>
              </li>
            ))}
          </ul>

          <MinorHeading>{PROMPT_WARNINGS_HEADING}</MinorHeading>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
            {PROMPT_WARNINGS.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </AboutSection>

        <AboutSection value="the-library" heading={SHORT_FORM_LIBRARY_HEADING}>
          <ShortFormTeacherDirections />
        </AboutSection>
      </Accordion>
    </section>
  );
}
