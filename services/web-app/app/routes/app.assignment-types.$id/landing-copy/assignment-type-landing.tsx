import { Fragment, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, CirclePlay, Presentation } from 'lucide-react';

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
  type CourseDeck,
} from './thesis-essay-course';
import { YAWP_LESSONS } from '~/domain/lesson-planner/yawp-lessons';

/**
 * Each lesson's tutorial video, by lesson number: its module in the
 * Teachers' Lounge course, where this teacher can open it. A lesson with no
 * entry shows no video link (Brian, Nov 6: the rows are the slide deck and
 * the video, nothing else).
 */
export type LessonVideos = Record<number, string>;
type LessonLinks = { lessonVideos: LessonVideos };

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
 * One lesson's row, as Brian drew it and then pared it down (Nov 6): its
 * number and title, then two fixed columns, the slide deck(s) to download and
 * the tutorial video to watch, so links line up down the card. A lesson
 * without one simply has no link for it.
 */
function CourseLessonRow({
  index,
  title,
  decks,
  tutorialHref,
  note,
}: {
  index: number | null;
  title: string;
  decks: CourseDeck[];
  tutorialHref: string | null;
  /** A closed box under the row (the YAWP! philosophy, under Pre-writing). */
  note?: ReactNode;
}) {
  return (
    <li data-testid="course-lesson" className="py-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="flex items-baseline gap-3 text-base">
        {index !== null ? (
          <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{index}</span>
        ) : null}
        <span data-lesson-title>{title}</span>
      </span>
      {/* Two fixed-width columns on every row, empty or not, so each "Slide
          deck" and each "Watch tutorial" starts at the same spot down the
          card. A lesson's second deck sits under its first. */}
      <span
        className={cn(
          'flex shrink-0 gap-6 text-sm sm:pl-0 sm:pt-0.5',
          index !== null ? 'pl-7' : 'pl-0'
        )}
      >
        <span data-course-column="slide-deck" className="flex w-40 flex-col gap-1.5">
          {decks.map((deck) => (
            <a
              key={deck.href}
              href={deck.href}
              download={deck.fileName}
              aria-label={`${title}: ${deck.label.toLowerCase()}${deck.label === 'Slide deck' ? '' : ' slide deck'} (PowerPoint)`}
              className={COURSE_LINK_CLASS}
            >
              <Presentation className="h-4 w-4" aria-hidden />
              {deck.label}
            </a>
          ))}
        </span>
        <span data-course-column="tutorial" className="flex w-32 flex-col">
          {tutorialHref ? (
            <Link
              to={tutorialHref}
              aria-label={`${title}: tutorial video`}
              className={COURSE_LINK_CLASS}
            >
              <CirclePlay className="h-4 w-4" aria-hidden />
              Watch tutorial
            </Link>
          ) : null}
        </span>
      </span>
      </div>
      {note ? <div className={cn('mt-3', index !== null && 'sm:pl-7')}>{note}</div> : null}
    </li>
  );
}

/**
 * The Thesis-Driven Essay course: one row per lesson, in order, each with
 * its slide deck and its tutorial video.
 */
function ThesisEssayCourse({
  block,
  lessonVideos,
}: {
  block: Extract<LandingBlock, { type: 'course' }>;
} & LessonLinks) {
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
          {THESIS_ESSAY_COURSE.map((lesson, index) => {
            const note = lesson.yawpLesson ? block.lessonNotes?.[lesson.yawpLesson] : undefined;
            return (
              <CourseLessonRow
                key={lesson.title}
                index={index + 1}
                title={lesson.title}
                decks={lesson.decks}
                tutorialHref={lessonVideos[index + 1] ?? null}
                note={
                  note ? (
                    <BoxedSection
                      section={note}
                      lessonVideos={lessonVideos}
                      defaultExpanded={false}
                      nested
                    />
                  ) : null
                }
              />
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/**
 * One lesson of the course, on the page of the step it teaches (Pre-Writing,
 * Thesis Statement): the same row the course card shows for it.
 */
function YawpLessonBlock({
  block,
  lessonVideos,
}: {
  block: Extract<LandingBlock, { type: 'lesson' }>;
} & LessonLinks) {
  const lesson = YAWP_LESSONS[block.slug];
  const inCourse = THESIS_ESSAY_COURSE.find((row) => row.yawpLesson === block.slug);
  return (
    <div className="space-y-3">
      {block.lead ? (
        <p className="text-sm text-foreground">
          <RichText text={block.lead} />
        </p>
      ) : null}
      <div
        className="mt-2 border-t border-[#E4DCCF] pt-2 dark:border-border"
        data-testid="yawp-lesson"
        data-tour="type-modules"
      >
        <ul className="flex flex-col">
          <CourseLessonRow
            index={null}
            title={lesson.title}
            decks={inCourse?.decks ?? [{ ...lesson.deck, label: 'Slide deck' }]}
            tutorialHref={lessonVideos[lesson.lessonNumber] ?? null}
          />
        </ul>
      </div>
    </div>
  );
}

/**
 * A paragraph's text. Where it names a lesson's tutorial, that phrase opens
 * the tutorial for a teacher who can watch it, and is plain text otherwise.
 */
function ParagraphText({
  block,
  lessonVideos,
}: {
  block: Extract<LandingBlock, { type: 'paragraph' }>;
} & LessonLinks) {
  const tutorial = block.tutorial;
  const href = tutorial ? lessonVideos[YAWP_LESSONS[tutorial.lesson].lessonNumber] : undefined;
  const at = tutorial ? block.text.indexOf(tutorial.linkText) : -1;
  if (!tutorial || !href || at < 0) return <RichText text={block.text} />;
  return (
    <>
      <RichText text={block.text.slice(0, at)} />
      <Link
        to={href}
        className="font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tutorial.linkText}
      </Link>
      <RichText text={block.text.slice(at + tutorial.linkText.length)} />
    </>
  );
}

/**
 * Where copy sits, which sets its color (Brian, Nov 3). On the cream page it
 * is the dark text color; inside a light box (How to Teach It, an opened
 * drop-down) it keeps the softer gray the How to Teach It box already uses.
 */
type Tone = 'page' | 'box';

const TONE_CLASS: Record<Tone, string> = {
  page: 'text-foreground',
  box: 'text-muted-foreground',
};

function Block({
  block,
  modules,
  tone,
  lessonVideos,
}: {
  block: LandingBlock;
  modules: LandingModule[];
  tone: Tone;
} & LessonLinks) {
  if (block.type === 'paragraph') {
    return (
      <p className={cn('text-sm sm:text-base', TONE_CLASS[tone])}>
        <ParagraphText block={block} lessonVideos={lessonVideos} />
      </p>
    );
  }
  if (block.type === 'bullets') {
    return (
      <ul className={cn('list-disc space-y-1.5 pl-5 text-sm sm:text-base', TONE_CLASS[tone])}>
        {block.items.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'course') {
    return <ThesisEssayCourse block={block} lessonVideos={lessonVideos} />;
  }
  if (block.type === 'lesson') {
    return <YawpLessonBlock block={block} lessonVideos={lessonVideos} />;
  }
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
        <Block key={index} block={block} modules={[]} tone="page" lessonVideos={{}} />
      ))}
    </div>
  );
}

/**
 * Sections that start closed: a box with the heading and Show inside it, and
 * a teacher opens the ones they want (Kevin and Brian, Nov 11: every section
 * matches the How to Teach It box). Brian's copy is all still there, word for
 * word; it just is not a wall of text by default. How to Teach It is boxed
 * the same way but starts open, since it is what a teacher came to use.
 */
export const COLLAPSED_SECTIONS: ReadonlySet<LandingSectionId> = new Set([
  'how-it-works',
  'when-to-use-it',
  'what-makes-a-good-one',
  'what-makes-a-strong-thesis',
  'philosophy',
]);

/**
 * The spotlight box (Brian, Nov 3), around How to Teach It and around each
 * opened drop-down's text: a shade lighter than the page, and it rises with a
 * deeper shadow on hover or when a link or button inside it has keyboard
 * focus (not a mouse click, so Hide/Show does not leave it raised). The border,
 * shadows and lift are the Lesson Library's Units tiles (library-home.tsx,
 * TILE), on a lighter fill so it stands out against this page. No lift when
 * the teacher prefers reduced motion.
 */
export const SPOTLIGHT_BOX = [
  'relative rounded-2xl border border-[#E4DCCF] bg-[#FDFCF9] p-5 sm:p-7',
  'shadow-[0_1px_2px_rgba(28,26,23,.06),0_4px_12px_-4px_rgba(28,26,23,.10)]',
  'transition duration-[160ms] ease-out',
  'hover:-translate-y-0.5 hover:border-[#D5CABA] hover:shadow-[0_2px_4px_rgba(28,26,23,.06),0_14px_28px_-8px_rgba(28,26,23,.20)]',
  'has-[:focus-visible]:-translate-y-0.5 has-[:focus-visible]:shadow-[0_2px_4px_rgba(28,26,23,.06),0_14px_28px_-8px_rgba(28,26,23,.20)]',
  'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:has-[:focus-visible]:translate-y-0',
  'dark:border-border dark:bg-white/[0.04]',
].join(' ');

/** A box inside a box (under a course lesson): flat, so only the outer one lifts. */
const NESTED_BOX =
  'rounded-xl border border-[#E4DCCF] bg-white/70 px-4 py-3 dark:border-border dark:bg-white/[0.03]';

/**
 * One section in its own box, the heading and the Show/Hide button inside it
 * (Kevin and Brian, Nov 11, modeled on How to Teach It). How to Teach It
 * opens expanded and folds to its heading and a two-line preview of its first
 * paragraph (Brian's Nov 3 mock-up); every other section opens closed, to its
 * heading alone. Nothing is remembered between visits.
 */
export function BoxedSection({
  section,
  modules = [],
  lessonVideos,
  defaultExpanded,
  preview: showPreview = false,
  nested = false,
  className,
}: {
  section: LandingSection;
  modules?: LandingModule[];
  defaultExpanded: boolean;
  /** Closed, show a two-line preview of the first paragraph. */
  preview?: boolean;
  /** Inside another box (a course lesson's note): a flat box and an h4. */
  nested?: boolean;
  className?: string;
} & LessonLinks) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bodyId = useId();
  const headingId = `landing-${section.id}`;
  const preview = showPreview
    ? section.blocks.find(
        (block): block is Extract<LandingBlock, { type: 'paragraph' }> =>
          block.type === 'paragraph'
      )
    : undefined;
  const label = expanded ? 'Hide' : 'Show';
  const Heading = nested ? 'h4' : 'h2';
  const isHowToTeach = section.id === 'how-to-teach-it';
  return (
    <section
      aria-labelledby={headingId}
      data-testid={isHowToTeach ? 'how-to-teach-spotlight' : `landing-section-${section.id}`}
      data-landing-box=""
      data-tour={section.id === 'how-it-works' ? 'type-directions' : undefined}
      className={cn(nested ? NESTED_BOX : SPOTLIGHT_BOX, className)}
    >
      <div className="flex items-center justify-between gap-4">
        <Heading
          id={headingId}
          className={nested ? 'text-sm font-semibold sm:text-base' : 'text-lg font-semibold sm:text-xl'}
        >
          {section.heading}
        </Heading>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? bodyId : undefined}
          aria-label={`${label} ${section.heading}`}
          onClick={() => setExpanded((open) => !open)}
          className="group flex shrink-0 items-center gap-3 rounded-full text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          <span
            aria-hidden
            className={cn(
              'flex items-center justify-center rounded-full border border-[#E4DCCF] bg-[#F3F1EC] text-foreground transition-colors group-hover:bg-[#ECE8E0] dark:border-border dark:bg-white/[0.06]',
              nested ? 'h-8 w-8' : 'h-10 w-10'
            )}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180'
              )}
            />
          </span>
        </button>
      </div>
      {expanded ? (
        <div id={bodyId} className="mt-3 flex flex-col gap-3">
          {section.blocks.map((block, index) => (
            <Block
              key={index}
              block={block}
              modules={modules}
              tone="box"
              lessonVideos={lessonVideos}
            />
          ))}
        </div>
      ) : preview ? (
        <p
          data-testid="how-to-teach-preview"
          className={cn('mt-3 line-clamp-2 text-sm sm:text-base', TONE_CLASS.box)}
        >
          <RichText text={preview.text} />
        </p>
      ) : null}
    </section>
  );
}

/**
 * How to Teach It, in its spotlight box: expanded when a teacher arrives;
 * Hide collapses it to the heading and a two-line preview, and Show brings
 * the rest back.
 */
export function HowToTeachSection({
  section,
  modules = [],
  lessonVideos,
  className,
}: {
  section: LandingSection;
  modules?: LandingModule[];
  /**
   * The How It Works pages (Kevin, Nov 10) put the same block on a white
   * card; the landing page keeps the spotlight box.
   */
  className?: string;
} & LessonLinks) {
  return (
    <BoxedSection
      section={section}
      modules={modules}
      lessonVideos={lessonVideos}
      defaultExpanded
      preview
      className={className}
    />
  );
}

function Section({
  section,
  modules,
  lessonVideos,
}: {
  section: LandingSection;
  modules: LandingModule[];
} & LessonLinks) {
  if (COLLAPSED_SECTIONS.has(section.id)) {
    return (
      <BoxedSection
        section={section}
        modules={modules}
        lessonVideos={lessonVideos}
        defaultExpanded={false}
      />
    );
  }
  if (section.id === 'how-to-teach-it') {
    return <HowToTeachSection section={section} modules={modules} lessonVideos={lessonVideos} />;
  }
  return <OpenSection section={section} modules={modules} lessonVideos={lessonVideos} />;
}

function OpenSection({
  section,
  modules,
  lessonVideos,
}: {
  section: LandingSection;
  modules: LandingModule[];
} & LessonLinks) {
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
        <Block
          key={index}
          block={block}
          modules={modules}
          tone="page"
          lessonVideos={lessonVideos}
        />
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
  lessonVideos = {},
}: {
  page: LandingPage;
  modules: LandingModule[];
  /** Each lesson's tutorial video, by lesson number, where the teacher can open it. */
  lessonVideos?: LessonVideos;
}) {
  // Every section is its own box (Nov 11), spaced evenly down the page.
  return (
    <div className="mb-6 flex flex-col gap-4" data-testid="assignment-type-landing">
      {page.sections.map((section) => (
        <Section
          key={section.id}
          section={section}
          modules={modules}
          lessonVideos={lessonVideos}
        />
      ))}
    </div>
  );
}
