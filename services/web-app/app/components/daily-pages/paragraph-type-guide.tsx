import { Target } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  enabledParagraphGuides,
  getParagraphGuide,
  type ParagraphGuide,
} from '~/domain/assignment-types/daily-pages-paragraph-guides';

/**
 * What a student is aiming for in one Daily Pages paragraph type.
 *
 * One component for both readers: teachers browse it on the Daily Pages page,
 * students open it from inside an assignment of that type, and both read the
 * same words — which name the same three parts the tutor coaches.
 */

/** One colour per part, used for the part's name and its mark in the model. */
const PART_STYLES = [
  'bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-50',
  'bg-sky-100 text-sky-950 dark:bg-sky-900/50 dark:text-sky-50',
  'bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50',
];

function partStyle(guide: ParagraphGuide, part: string) {
  const index = guide.parts.findIndex((candidate) => candidate.name === part);
  return PART_STYLES[index] ?? PART_STYLES[0];
}

/** The model paragraph with each part's excerpt marked in place. */
function MarkedModel({ guide }: { guide: ParagraphGuide }) {
  const { text, marks } = guide.model;
  const pieces: ReactNode[] = [];
  let cursor = 0;
  const ordered = marks
    .map((mark) => ({ ...mark, start: text.indexOf(mark.excerpt) }))
    .filter((mark) => mark.start >= cursor)
    .sort((a, b) => a.start - b.start);

  for (const mark of ordered) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) pieces.push(text.slice(cursor, mark.start));
    pieces.push(
      <mark
        key={mark.part}
        data-part={mark.part}
        title={mark.part}
        className={`rounded px-0.5 ${partStyle(guide, mark.part)}`}
      >
        {mark.excerpt}
      </mark>
    );
    cursor = mark.start + mark.excerpt.length;
  }
  if (cursor < text.length) pieces.push(text.slice(cursor));

  return <p className="font-serif text-[15px] leading-relaxed">{pieces}</p>;
}

function GuideHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

export function ParagraphTypeGuide({
  paragraphMode,
}: {
  paragraphMode: string | null | undefined;
}) {
  const guide = getParagraphGuide(paragraphMode);
  if (!guide) return null;

  return (
    <div
      className="space-y-5 text-sm"
      data-testid={`paragraph-guide-${guide.key}`}
    >
      <p className="text-foreground/80">{guide.summary}</p>

      <section>
        <GuideHeading>The three parts</GuideHeading>
        <ol className="space-y-2">
          {guide.parts.map((part, index) => (
            <li key={part.name} className="flex gap-3">
              <span
                className={`h-fit shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${PART_STYLES[index]}`}
              >
                {index + 1}. {part.name}
              </span>
              <span className="text-foreground/80">{part.explanation}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
        <GuideHeading>The part students skip most</GuideHeading>
        <p className="text-foreground/90">{guide.oftenSkipped}</p>
      </section>

      <section>
        <GuideHeading>A strong paragraph</GuideHeading>
        <p className="mb-2 text-xs italic text-muted-foreground">
          Prompt: {guide.model.prompt}
        </p>
        <div className="rounded-md border bg-background p-3">
          <MarkedModel guide={guide} />
        </div>
        <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {guide.parts.map((part, index) => (
            <span
              key={part.name}
              className={`rounded px-1.5 py-0.5 ${PART_STYLES[index]}`}
            >
              {part.name}
            </span>
          ))}
        </p>
      </section>

      <section>
        <GuideHeading>A common miss, and the fix</GuideHeading>
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="font-serif text-[15px] leading-relaxed text-foreground/80">
            {guide.miss.text}
          </p>
        </div>
        <dl className="mt-2 space-y-1.5">
          <div>
            <dt className="inline font-medium">What’s missing: </dt>
            <dd className="inline text-foreground/80">
              {guide.miss.whatsMissing}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">The fix: </dt>
            <dd className="inline text-foreground/80">{guide.miss.fix}</dd>
          </div>
        </dl>
      </section>

      <section>
        <GuideHeading>What the tutor will ask you</GuideHeading>
        <ul className="list-disc space-y-1 pl-5 text-foreground/80">
          {guide.tutorAsks.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function chosenGuides(paragraphModes: readonly string[]): ParagraphGuide[] {
  return paragraphModes
    .map((key) => getParagraphGuide(key))
    .filter((guide): guide is ParagraphGuide => guide !== null);
}

/**
 * The guides for an assignment's paragraph types. One type shows its guide
 * as is; when an assignment combines types, each guide gets its own heading
 * so a student can tell which move each part belongs to.
 */
export function ParagraphTypeGuideList({
  paragraphModes,
}: {
  paragraphModes: readonly string[];
}) {
  const guides = chosenGuides(paragraphModes);
  if (guides.length === 0) return null;
  if (guides.length === 1) {
    return <ParagraphTypeGuide paragraphMode={guides[0].key} />;
  }

  return (
    <div className="space-y-8">
      {guides.map((guide) => (
        <section key={guide.key} aria-labelledby={`guide-${guide.key}`}>
          <h3
            id={`guide-${guide.key}`}
            className="mb-3 border-b pb-1 text-base font-semibold"
          >
            {guide.label}
          </h3>
          <ParagraphTypeGuide paragraphMode={guide.key} />
        </section>
      ))}
    </div>
  );
}

/**
 * The student's way into the guide from inside an assignment: a button by
 * the prompt that opens the guide for each of the assignment's paragraph
 * types. Nothing renders when the assignment has none.
 */
export function ParagraphTypeGuideButton({
  paragraphModes,
}: {
  paragraphModes: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const guides = chosenGuides(paragraphModes);
  if (guides.length === 0) return null;
  const title = guides.map((guide) => guide.label).join(' and ');

  // Opened from a plain button rather than DialogTrigger, so the button does
  // not depend on the dialog's context to render, and the dialog is mounted
  // only while open, so it appears as soon as it mounts.
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        data-testid="paragraph-guide-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Target className="h-3.5 w-3.5" aria-hidden="true" />
        What you’re aiming for
      </Button>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{title}: what you’re aiming for</DialogTitle>
              <DialogDescription>
                {guides.length > 1
                  ? 'This paragraph combines more than one move. Here is how each works, and what a strong one looks like.'
                  : 'How this kind of paragraph works, and what a strong one looks like.'}
              </DialogDescription>
            </DialogHeader>
            <ParagraphTypeGuideList
              paragraphModes={guides.map((guide) => guide.key)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export const PARAGRAPH_GUIDES_HEADING = 'The kinds of paragraphs';

/**
 * Every switched-on paragraph type, for the Daily Pages page. A type appears
 * here the day it is switched on, like the library and the assignment sheet.
 */
export function ParagraphTypeGuides() {
  const guides = enabledParagraphGuides();
  if (guides.length === 0) return null;

  return (
    <section
      className="mb-6 rounded-lg border bg-muted/40 p-4"
      aria-labelledby="paragraph-guides-heading"
      data-testid="paragraph-guides"
    >
      <h2 id="paragraph-guides-heading" className="text-base font-semibold">
        {PARAGRAPH_GUIDES_HEADING}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Each paragraph type practices one move. Students see the same
        explanation from inside an assignment of that type, under “What you’re
        aiming for”.
      </p>
      <Accordion type="multiple" className="mt-3">
        {guides.map((guide) => (
          <AccordionItem
            key={guide.key}
            value={guide.key}
            className="border-b last:border-b-0"
          >
            <AccordionTrigger className="py-3 text-left text-sm font-semibold">
              <span>
                {guide.label}
                <span className="ml-2 font-normal text-muted-foreground">
                  {guide.parts.map((part) => part.name).join(' → ')}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-0">
              <ParagraphTypeGuide paragraphMode={guide.key} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
