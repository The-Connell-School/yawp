/**
 * One slide, rendered to fill whatever it is projected onto.
 *
 * Type is sized in viewport units with `clamp`, so the same slide is legible on
 * a laptop preview and from the back of a classroom without the teacher
 * touching a zoom control. Each layout is a genuinely different shape — a
 * compare slide is two columns, not two bullets — because the layout is the
 * part a deck has and a list of slides does not.
 */
import type { Slide } from '~/domain/lesson-planner/slide-deck';

/** Scales with the slide surface, floored and capped so it never gets silly. */
const TITLE_TYPE = 'clamp(1.75rem, 4.6cqw, 4.5rem)';
const BODY_TYPE = 'clamp(1.1rem, 2.9cqw, 2.75rem)';
const LIST_TYPE = 'clamp(1rem, 2.5cqw, 2.25rem)';
const LABEL_TYPE = 'clamp(0.7rem, 1.3cqw, 1.1rem)';
/** For a slide holding real student writing rather than a phrase. */
const PASSAGE_TYPE = 'clamp(0.85rem, 1.9cqw, 1.7rem)';

export function SlideCanvas({ slide }: { slide: Slide }) {
  return (
    <div
      // Container queries: the slide sizes to its own box, so the same
      // component works full-screen, in a preview, and on a print page.
      className="@container flex h-full w-full flex-col justify-center px-[6%] py-[5%]"
      data-layout={slide.layout}
    >
      <SlideBody slide={slide} />
    </div>
  );
}

function SlideBody({ slide }: { slide: Slide }) {
  switch (slide.layout) {
    case 'title':
      return (
        <div className="flex flex-col gap-[0.5em] text-center">
          <h1
            className="font-semibold leading-[1.05] tracking-tight text-slate-900"
            style={{ fontSize: TITLE_TYPE }}
          >
            {slide.title}
          </h1>
          {slide.subtitle ? (
            <p className="text-slate-500" style={{ fontSize: BODY_TYPE }}>
              {slide.subtitle}
            </p>
          ) : null}
        </div>
      );

    case 'closing':
      return (
        <div className="flex flex-col gap-[0.5em] text-center">
          <h2
            className="font-semibold leading-[1.1] tracking-tight text-slate-900"
            style={{ fontSize: TITLE_TYPE }}
          >
            {slide.title}
          </h2>
          {slide.body ? (
            <p className="text-slate-600" style={{ fontSize: BODY_TYPE }}>
              {slide.body}
            </p>
          ) : null}
        </div>
      );

    case 'statement':
      return (
        <div className="flex flex-col gap-[0.6em]">
          <SlideTitle>{slide.title}</SlideTitle>
          {slide.body ? (
            <p
              className="max-w-[22ch] font-medium leading-[1.25] text-slate-900"
              style={{ fontSize: BODY_TYPE }}
            >
              {slide.body}
            </p>
          ) : null}
        </div>
      );

    case 'quote':
      return (
        <div className="flex flex-col gap-[0.5em]">
          <SlideTitle>{slide.title}</SlideTitle>
          <blockquote
            className="border-l-[0.12em] border-primary pl-[0.6em] italic leading-[1.35] text-slate-800"
            style={{ fontSize: BODY_TYPE }}
          >
            {slide.body}
          </blockquote>
          {slide.attribution ? (
            <p className="text-slate-500" style={{ fontSize: LIST_TYPE }}>
              — {slide.attribution}
            </p>
          ) : null}
        </div>
      );

    case 'prompt':
      return (
        <div className="flex flex-col items-center gap-[0.55em] text-center">
          <p
            className="font-semibold uppercase tracking-[0.14em] text-primary"
            style={{ fontSize: LABEL_TYPE }}
          >
            {slide.title}
          </p>
          <p
            className="max-w-[24ch] font-medium leading-[1.3] text-slate-900"
            style={{ fontSize: TITLE_TYPE }}
          >
            {slide.body}
          </p>
        </div>
      );

    case 'compare': {
      // A compare slide is as often two paragraphs — a weak conclusion beside a
      // strong one — as it is two phrases. Step the type down for the long case
      // so the columns still fit the slide instead of running off the bottom.
      const longest = Math.max(
        slide.left?.text.length ?? 0,
        slide.right?.text.length ?? 0
      );
      const columnType =
        longest > 220 ? PASSAGE_TYPE : longest > 110 ? BODY_TYPE : LIST_TYPE;
      return (
        <div className="flex flex-col gap-[0.7em]">
          <SlideTitle>{slide.title}</SlideTitle>
          <div className="grid gap-[0.8em] @md:grid-cols-2">
            {[slide.left, slide.right].map((column, index) =>
              column ? (
                <div
                  key={index}
                  className="flex flex-col gap-[0.35em] rounded-[0.4em] border border-slate-200 bg-white/70 p-[0.8em]"
                >
                  <p
                    className="font-semibold uppercase tracking-[0.12em] text-primary"
                    style={{ fontSize: LABEL_TYPE }}
                  >
                    {column.label}
                  </p>
                  <p
                    className="leading-[1.35] text-slate-900"
                    style={{ fontSize: columnType }}
                  >
                    {column.text}
                  </p>
                </div>
              ) : null
            )}
          </div>
        </div>
      );
    }

    case 'steps':
      return (
        <div className="flex flex-col gap-[0.6em]">
          <SlideTitle>{slide.title}</SlideTitle>
          <ol className="flex flex-col gap-[0.45em]">
            {slide.bullets?.map((bullet, index) => (
              <li
                key={index}
                className="flex items-baseline gap-[0.6em] leading-[1.3] text-slate-900"
                style={{ fontSize: LIST_TYPE }}
              >
                <span
                  className="flex aspect-square w-[1.6em] shrink-0 items-center justify-center self-start rounded-full bg-primary font-semibold text-primary-foreground"
                  style={{ fontSize: '0.72em' }}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">{bullet}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    case 'bullets':
    default:
      return (
        <div className="flex flex-col gap-[0.6em]">
          <SlideTitle>{slide.title}</SlideTitle>
          <ul className="flex flex-col gap-[0.45em]">
            {slide.bullets?.map((bullet, index) => (
              <li
                key={index}
                className="flex items-baseline gap-[0.6em] leading-[1.3] text-slate-900"
                style={{ fontSize: LIST_TYPE }}
              >
                <span
                  aria-hidden
                  className="mt-[0.45em] aspect-square w-[0.32em] shrink-0 self-start rounded-full bg-primary"
                />
                <span className="min-w-0">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

function SlideTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-semibold leading-[1.1] tracking-tight text-slate-900"
      style={{ fontSize: 'clamp(1.35rem, 3.4cqw, 3.25rem)' }}
    >
      {children}
    </h2>
  );
}
