import { Fragment } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown, FileText, Presentation } from 'lucide-react';

import { cn } from '~/utils/misc';

import type {
  LandingBlock,
  LandingPage,
  LandingSection,
  LandingSectionId,
} from './content';
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
      {/* Flat: the How to Teach It box around it is the card. A rule above
          sets the lessons apart from Brian's paragraph. */}
      <div
        className="mt-2 border-t border-[#E4DCCF] pt-5 dark:border-border"
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
 * The description, in the page header beside the type's image, where its
 * stored description used to sit. It needs no heading: it is the first thing
 * under the title. Always shown whole, never collapsed or cut short (Brian,
 * Nov 3): the image beside it is what keeps it from reading as a wall of text.
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

/**
 * Sections that start closed: the heading shows with a chevron, and a teacher
 * opens the ones they want. Brian's copy is all still there, word for word;
 * it just is not a wall of text by default. How to Teach It (the course or
 * the steps) and the Prompt Library intro stay open: they are what a teacher
 * came to the page to use.
 */
export const COLLAPSED_SECTIONS: ReadonlySet<LandingSectionId> = new Set([
  'how-it-works',
  'when-to-use-it',
  'what-makes-a-good-one',
  'what-makes-a-strong-thesis',
]);

function CollapsibleSection({
  section,
  modules,
}: {
  section: LandingSection;
  modules: LandingModule[];
}) {
  const headingId = `landing-${section.id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={`landing-section-${section.id}`}
      data-tour={section.id === 'how-it-works' ? 'type-directions' : undefined}
    >
      <AccordionPrimitive.Root type="single" collapsible>
        <AccordionPrimitive.Item value={section.id} className="border-b">
          <AccordionPrimitive.Header asChild>
            <h2 id={headingId} className="flex">
              <AccordionPrimitive.Trigger className="group flex flex-1 items-center justify-between gap-3 py-3 text-left text-base font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {section.heading}
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  aria-hidden
                />
              </AccordionPrimitive.Trigger>
            </h2>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="flex flex-col gap-3 pb-5 pt-1">
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} modules={modules} />
              ))}
            </div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      </AccordionPrimitive.Root>
    </section>
  );
}

/**
 * How to Teach It is set off in a spotlight box (Brian, Nov 3): a shade
 * lighter than the page, and it rises with a deeper shadow on hover or when
 * a link inside it has focus. The border, shadows and lift are the Lesson
 * Library's Units tiles (library-home.tsx, TILE), on a lighter fill so it
 * stands out against this page. No lift when the teacher prefers reduced
 * motion.
 */
export const HOW_TO_TEACH_SPOTLIGHT = [
  'relative rounded-2xl border border-[#E4DCCF] bg-[#FDFCF9] p-5 sm:p-7',
  'shadow-[0_1px_2px_rgba(28,26,23,.06),0_4px_12px_-4px_rgba(28,26,23,.10)]',
  'transition duration-[160ms] ease-out',
  'hover:-translate-y-0.5 hover:border-[#D5CABA] hover:shadow-[0_2px_4px_rgba(28,26,23,.06),0_14px_28px_-8px_rgba(28,26,23,.20)]',
  'focus-within:-translate-y-0.5 focus-within:shadow-[0_2px_4px_rgba(28,26,23,.06),0_14px_28px_-8px_rgba(28,26,23,.20)]',
  'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0',
  'dark:border-border dark:bg-white/[0.04]',
].join(' ');

function Section({
  section,
  modules,
}: {
  section: LandingSection;
  modules: LandingModule[];
}) {
  if (COLLAPSED_SECTIONS.has(section.id)) {
    return <CollapsibleSection section={section} modules={modules} />;
  }
  if (section.id === 'how-to-teach-it') {
    return (
      <div data-testid="how-to-teach-spotlight" className={HOW_TO_TEACH_SPOTLIGHT}>
        <OpenSection section={section} modules={modules} />
      </div>
    );
  }
  return <OpenSection section={section} modules={modules} />;
}

function OpenSection({
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
  // Back-to-back drop-downs stack as one list, like the library's own row;
  // open sections keep their breathing room around them.
  const groups: LandingSection[][] = [];
  for (const section of page.sections) {
    const last = groups.at(-1);
    if (
      last &&
      COLLAPSED_SECTIONS.has(section.id) &&
      COLLAPSED_SECTIONS.has(last[0]!.id)
    ) {
      last.push(section);
    } else {
      groups.push([section]);
    }
  }
  return (
    <div className="mb-6 flex flex-col gap-6" data-testid="assignment-type-landing">
      {groups.map((group) => (
        <div key={group[0]!.id} className="flex flex-col">
          {group.map((section) => (
            <Section key={section.id} section={section} modules={modules} />
          ))}
        </div>
      ))}
    </div>
  );
}
