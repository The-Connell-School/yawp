import { Fragment, type ReactNode } from 'react';
import { FileText, Presentation } from 'lucide-react';

import { cn } from '~/utils/misc';

import type { LandingBlock, LandingPage, LandingSection } from './content';
import {
  THESIS_ESSAY_COURSE,
  THESIS_ESSAY_COURSE_TITLE,
} from './thesis-essay-course';

/**
 * Inline markup used by the landing copy: **bold** and *italic*. Nothing else
 * is interpreted, so copy can carry quotes, dashes and ellipses as written.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

/** A module, as the route loads it. */
export type LandingModule = { id: string; title: string };

function Steps({
  block,
  modules,
}: {
  block: Extract<LandingBlock, { type: 'steps' }>;
  modules: LandingModule[];
}) {
  if (modules.length === 0) return null;
  return (
    <div className="space-y-2">
      {block.lead ? (
        <p className="text-sm text-foreground">
          <RichText text={block.lead} />
        </p>
      ) : null}
      <ol className="divide-y rounded-lg border" data-tour="type-modules">
        {modules.map((module, index) => (
          <li
            key={module.id}
            data-testid="how-to-teach-step"
            className="flex items-baseline gap-2 px-3 py-2.5 text-sm"
          >
            <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
              {index + 1}.
            </span>
            <span data-step-title className="font-medium">
              {module.title.trim()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const COURSE_LINK_CLASS =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The Thesis-Driven Essay course, as Brian drew it: one row per lesson, in
 * order, each with its lesson plan (a PDF, opened in a new tab) and slide
 * deck (a PowerPoint file, downloaded). Lessons without one simply have no
 * link for it.
 */
function ThesisEssayCourse({
  block,
}: {
  block: Extract<LandingBlock, { type: 'course' }>;
}) {
  return (
    <div className="space-y-3">
      {block.lead ? (
        <p className="text-sm text-foreground">
          <RichText text={block.lead} />
        </p>
      ) : null}
      <div
        className="rounded-xl border bg-background p-5 shadow-sm sm:p-7"
        data-testid="thesis-essay-course"
        data-tour="type-modules"
      >
        <h3 className="mb-2 text-lg font-semibold sm:text-xl">
          {THESIS_ESSAY_COURSE_TITLE}
        </h3>
        <ol className="flex flex-col divide-y">
          {THESIS_ESSAY_COURSE.map((lesson, index) => (
            <li
              key={lesson.title}
              data-testid="course-lesson"
              className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <span className="flex items-baseline gap-3 text-base">
                <span className="w-4 shrink-0 tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span data-lesson-title>{lesson.title}</span>
              </span>
              {/* Two fixed-width columns on every row, empty or not, so each
                  "Lesson plan" and each "Slide deck" starts at the same spot
                  down the card. A lesson's second deck sits under its first. */}
              <span className="flex shrink-0 gap-6 pl-7 text-sm sm:pl-0 sm:pt-0.5">
                <span data-course-column="lesson-plan" className="flex w-28 flex-col">
                  {lesson.lessonPlan ? (
                    <a
                      href={lesson.lessonPlan.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${lesson.title}: lesson plan (PDF)`}
                      className={COURSE_LINK_CLASS}
                    >
                      <FileText className="h-4 w-4" aria-hidden />
                      Lesson plan
                    </a>
                  ) : null}
                </span>
                <span data-course-column="slide-deck" className="flex w-40 flex-col gap-1.5">
                  {lesson.decks.map((deck) => (
                    <a
                      key={deck.href}
                      href={deck.href}
                      download={deck.fileName}
                      aria-label={`${lesson.title}: ${deck.label.toLowerCase()}${deck.label === 'Slide deck' ? '' : ' slide deck'} (PowerPoint)`}
                      className={COURSE_LINK_CLASS}
                    >
                      <Presentation className="h-4 w-4" aria-hidden />
                      {deck.label}
                    </a>
                  ))}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Block({
  block,
  modules,
}: {
  block: LandingBlock;
  modules: LandingModule[];
}) {
  if (block.type === 'paragraph') {
    return (
      <p className="text-sm text-muted-foreground sm:text-base">
        <RichText text={block.text} />
      </p>
    );
  }
  if (block.type === 'bullets') {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
        {block.items.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'course') return <ThesisEssayCourse block={block} />;
  return <Steps block={block} modules={modules} />;
}

/**
 * The description, in the page header where the type's stored description
 * used to sit. It needs no heading: it is the first thing under the title.
 */
export function LandingDescription({ page }: { page: LandingPage }) {
  return (
    <div className="flex flex-col gap-3" data-testid="landing-description">
      {page.description.map((block, index) => (
        <Block key={index} block={block} modules={[]} />
      ))}
    </div>
  );
}

function Section({
  section,
  modules,
}: {
  section: LandingSection;
  modules: LandingModule[];
}) {
  const headingId = `landing-${section.id}`;
  // The library right below the intro is labelled "Prompt Library" already;
  // a second visible heading saying the same thing would only stack up.
  const headingHidden = section.id === 'prompt-library';
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3"
      data-testid={`landing-section-${section.id}`}
      data-tour={section.id === 'how-it-works' ? 'type-directions' : undefined}
    >
      <h2
        id={headingId}
        className={cn('text-lg font-semibold', headingHidden && 'sr-only')}
      >
        {section.heading}
      </h2>
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} modules={modules} />
      ))}
    </section>
  );
}

/**
 * Everything the landing page says between the header and the library:
 * How to Teach It, When to use it, How it works, and so on, in the order the
 * page's copy lists them. The library, the New menu, and the teacher's
 * documents are the route's, unchanged.
 */
export function LandingSections({
  page,
  modules,
}: {
  page: LandingPage;
  modules: LandingModule[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-6" data-testid="assignment-type-landing">
      {page.sections.map((section) => (
        <Section key={section.id} section={section} modules={modules} />
      ))}
    </div>
  );
}
