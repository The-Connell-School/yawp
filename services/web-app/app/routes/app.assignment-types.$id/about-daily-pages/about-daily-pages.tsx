import type { ReactNode } from 'react';

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

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-2 mt-5 text-sm font-semibold text-foreground">
      {children}
    </h4>
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
 */
export function AboutDailyPages() {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="text-base font-semibold">{ABOUT_HEADING}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{ABOUT_LEDE}</p>

      <SubHeading>{WHAT_IT_IS_HEADING}</SubHeading>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {WHAT_IT_IS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <SubHeading>{WHAT_IT_IS_NOT_HEADING}</SubHeading>
      <dl className="space-y-1.5 text-sm text-foreground/80">
        {WHAT_IT_IS_NOT.map((item) => (
          <div key={item.claim}>
            <dt className="inline font-medium">{item.claim} </dt>
            <dd className="inline text-muted-foreground">{item.detail}</dd>
          </div>
        ))}
      </dl>

      <SubHeading>{HOW_ITS_GRADED_HEADING}</SubHeading>
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
              <th scope="row" className="pr-2 font-medium text-foreground/90">
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

      <SubHeading>{HOW_TO_USE_HEADING}</SubHeading>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {HOW_TO_USE.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <SubHeading>{WRITE_YOUR_OWN_HEADING}</SubHeading>
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

      <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {REWRITE_HEADING}
      </p>
      <ul className="space-y-3 text-sm">
        {PROMPT_REWRITES.map((rewrite) => (
          <li
            key={rewrite.before}
            className="rounded-md border border-border/60 bg-background/60 p-3"
          >
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground/70">Instead of</span>{' '}
              <span className="line-through">{rewrite.before}</span>
            </p>
            <p className="mt-1 text-foreground/90">
              <span className="font-medium text-foreground/70">Try</span>{' '}
              {rewrite.after}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{rewrite.why}</p>
          </li>
        ))}
      </ul>

      <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {PROMPT_WARNINGS_HEADING}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {PROMPT_WARNINGS.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}
