/**
 * The gallery deck (Yawp! Lesson Deck Kit, spec v3), drawn on a 1280×720
 * design canvas that scales with its box: every size below is the kit's
 * pixel size, in `u` (1/1280 of the slide's width). Georgia for what
 * students read as an idea, Arial for instructions, labels and facts;
 * Georgia never bold. Left-aligned, 80px margins, no boxes or shadows, no
 * slide numbers. The painting is never under text, and wherever it hangs it
 * is credited.
 */
import type { CSSProperties, ReactNode } from 'react';
import { deckArt, type DeckArt } from '~/domain/lesson-planner/deck-art';
import { splitColorMarks } from '~/domain/lesson-planner/deck-colors';
import {
  GALLERY_COLORS as C,
  GALLERY_FALLBACK_FONTS_HREF,
  GALLERY_FONTS,
  galleryColors,
  galleryRunningHead,
  planGalleryDeck,
  promptTypeSize,
  type GallerySlidePlan,
} from '~/domain/lesson-planner/deck-gallery';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

/** Georgia and Arial first; these only stand in where a machine lacks them. */
export const GALLERY_FONTS_HREF = GALLERY_FALLBACK_FONTS_HREF;

/** A kit pixel, at whatever size the slide is drawn. */
const u = (px: number) => `calc(${px} * 100cqw / 1280)`;

const SERIF: CSSProperties = { fontFamily: GALLERY_FONTS.serif, fontWeight: 400 };
const SANS: CSSProperties = { fontFamily: GALLERY_FONTS.sans, fontWeight: 400 };
const CAPS: CSSProperties = { ...SANS, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em' };
/** Cream type on a dark ground or the accent wall. */
const CREAM = '#F3F0E8';

type Tone = {
  ink: string;
  muted: string;
  /** The mode word and accented words. */
  accent: string;
  rule: string;
  /** The slide's deck color, for numerals and bands, even on dark grounds. */
  color: string;
};

function toneFor(plan: GallerySlidePlan): Tone {
  if (plan.ground === 'pine') return { ink: CREAM, muted: '#C5CCC9', accent: C.accentOnDark, rule: C.pineRule, color: C.accentOnDark };
  if (plan.ground === 'ink') return { ink: CREAM, muted: '#BDB9B2', accent: C.accentOnDark, rule: C.inkRule, color: C.accentOnDark };
  if (plan.ground === 'accent') return { ink: CREAM, muted: '#F1DED6', accent: '#F6E3DA', rule: '#C9876B', color: CREAM };
  return { ink: C.ink, muted: C.stone, accent: plan.color, rule: C.rule, color: plan.color };
}

function background(plan: GallerySlidePlan, primary: string): string {
  if (plan.ground === 'pine') return C.pine;
  if (plan.ground === 'ink') return C.ink;
  if (plan.ground === 'accent') return primary;
  return C.paper;
}

/** A soft band of the slide's color behind a correct answer: a solid tint, never transparency. */
function band(color: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));
  const [pr, pg, pb] = [0xf3, 0xf0, 0xe8];
  const mix = (c: number, p: number) => Math.round(p + (c - p) * 0.16);
  return `rgb(${mix(r!, pr)}, ${mix(g!, pg)}, ${mix(b!, pb)})`;
}

export function GallerySlideCanvas({ deck, index }: { deck: SlideDeck; index: number }) {
  const plan = planGalleryDeck(deck)[index];
  if (!plan) return null;
  const colors = galleryColors(deck);
  const tone = toneFor(plan);
  const art = deckArt(deck.art);
  return (
    <div
      className="@container relative h-full w-full overflow-hidden"
      data-layout={plan.slide.layout}
      data-template={plan.template}
      data-ground={plan.ground}
      data-theme="gallery"
      style={{ ...SANS, background: background(plan, colors[0]!), color: tone.ink }}
    >
      <TemplateBody plan={plan} deck={deck} tone={tone} art={art} colors={colors} />
    </div>
  );
}

/** A slide drawn at full size and scaled down, so a thumbnail keeps its type. */
export function GallerySlideThumbnail({ deck, index, width }: { deck: SlideDeck; index: number; width: number }) {
  const scale = width / 1280;
  return (
    <div className="relative overflow-hidden" style={{ width, height: width * (9 / 16) }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: 1280, height: 720, transform: `scale(${scale})` }}>
        <GallerySlideCanvas deck={deck} index={index} />
      </div>
    </div>
  );
}

/** Text with its color marks: the parts of a thesis, each in its color. */
function Marked({ text, colors, accentWord, accent }: { text: string; colors: string[]; accentWord?: string; accent?: string }) {
  const runs = splitColorMarks(text, colors);
  return (
    <>
      {runs.map((run, i) =>
        run.color ? (
          <span key={i} style={{ color: run.color }}>
            {run.text}
          </span>
        ) : (
          <WithAccent key={i} text={run.text} word={accentWord} color={accent} />
        )
      )}
    </>
  );
}

/** The one word a big idea sets in the accent, in italic. */
function WithAccent({ text, word, color }: { text: string; word?: string; color?: string }) {
  const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (!word || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color, fontStyle: 'italic' }}>{text.slice(at, at + word.length)}</span>
      {text.slice(at + word.length)}
    </>
  );
}

function RunningHead({ deck, tone, art, left = 80, right = 80, swatch = true }: { deck: SlideDeck; tone: Tone; art: DeckArt | null; left?: number; right?: number; swatch?: boolean }) {
  return (
    <div className="absolute" style={{ left: u(left), right: u(right), top: u(40) }}>
      <div className="flex items-center" style={{ gap: u(14), height: u(28) }}>
        {swatch && art ? (
          <img aria-hidden alt="" src={art.crops.swatch} style={{ width: u(26), height: u(26), flexShrink: 0, objectFit: 'cover' }} />
        ) : null}
        <span className="truncate" style={{ ...CAPS, fontSize: u(13), color: tone.muted }}>
          {galleryRunningHead(deck)}
        </span>
      </div>
      <div style={{ marginTop: u(14), borderTop: `1px solid ${tone.rule}` }} />
    </div>
  );
}

function Mode({ text, tone, size = 36 }: { text: string | null; tone: Tone; size?: number }) {
  if (!text) return null;
  return (
    <p data-testid="gallery-mode" style={{ ...SERIF, fontStyle: 'italic', fontSize: u(size), lineHeight: 1, color: tone.accent, whiteSpace: 'nowrap' }}>
      {text}
    </p>
  );
}

function Headline({ children, size = 54 }: { children: ReactNode; size?: number }) {
  return <h2 style={{ ...SERIF, fontSize: u(size), lineHeight: 1.0, letterSpacing: '-0.01em' }}>{children}</h2>;
}

function Prompt({ text, colors, tone, accentWord, light }: { text: string; colors: string[]; tone: Tone; accentWord?: string; light?: boolean }) {
  const size = promptTypeSize(text);
  return (
    <p style={{ ...SERIF, fontSize: u(size), lineHeight: size >= 68 ? 1.05 : 1.12, color: light ? tone.ink : undefined }}>
      <Marked text={text} colors={colors} accentWord={accentWord} accent={tone.accent} />
    </p>
  );
}

function Detail({ children, tone, size = 20 }: { children: ReactNode; tone: Tone; size?: number }) {
  return <p style={{ ...SANS, fontSize: u(size), lineHeight: 1.5, color: tone.muted }}>{children}</p>;
}

/** Arial bold in a 1.5px pill: minutes, grouping. */
function Chip({ children, tone }: { children: ReactNode; tone: Tone }) {
  return (
    <span
      data-testid="gallery-chip"
      style={{ ...SANS, fontWeight: 700, fontSize: u(17), lineHeight: 1, color: tone.ink, border: `1.5px solid ${tone.ink}`, borderRadius: 999, padding: `${u(10)} ${u(20)}`, whiteSpace: 'nowrap' }}
    >
      {children}
    </span>
  );
}

/** The wall label: artist, title and year, medium and collection. */
function WallLabel({ art, tone, compact = false }: { art: DeckArt; tone: Tone; compact?: boolean }) {
  if (compact) {
    return (
      <p data-testid="gallery-credit" style={{ ...SANS, fontSize: u(14), lineHeight: 1.4, color: tone.muted }}>
        {art.artist}, <em>{art.title}</em>, {art.year} · {art.collection}
      </p>
    );
  }
  return (
    <div data-testid="gallery-credit" className="flex flex-col" style={{ gap: u(4) }}>
      <p style={{ ...SANS, fontWeight: 700, fontSize: u(16), color: tone.ink }}>{art.artist}</p>
      <p style={{ ...SERIF, fontStyle: 'italic', fontSize: u(20), color: tone.ink }}>
        {art.title}, {art.year}
      </p>
      <p style={{ ...SANS, fontSize: u(14), color: tone.muted }}>
        {art.medium} · {art.collection}
      </p>
    </div>
  );
}

/** The painting whole, matted the way a museum shows it. */
function Plate({ art, style }: { art: DeckArt; style: CSSProperties }) {
  return (
    <div className="absolute flex items-center justify-center" style={{ ...style, background: C.mat }}>
      <img src={art.src} alt={`${art.title}, ${art.artist}`} className="h-full w-full object-contain" style={{ padding: u(14) }} />
    </div>
  );
}

function Rows({ rows, tone }: { rows: { lead?: ReactNode; text: ReactNode; trail?: ReactNode; band?: string }[]; tone: Tone }) {
  return (
    <ol className="flex flex-col" style={{ borderBottom: `1px solid ${tone.rule}` }}>
      {rows.map((row, i) => (
        <li
          key={i}
          data-testid={row.band ? 'gallery-answer' : undefined}
          className="flex items-baseline"
          style={{ gap: u(28), padding: `${u(18)} ${row.band ? u(16) : 0}`, borderTop: `1px solid ${tone.rule}`, background: row.band }}
        >
          {row.lead !== undefined ? <span style={{ minWidth: u(46) }}>{row.lead}</span> : null}
          <span className="flex-1" style={{ ...SANS, fontSize: u(26), lineHeight: 1.4 }}>
            {row.text}
          </span>
          {row.trail ? <span style={{ ...SANS, fontWeight: 700, fontSize: u(17), color: tone.muted }}>{row.trail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

function TemplateBody({ plan, deck, tone, art, colors }: { plan: GallerySlidePlan; deck: SlideDeck; tone: Tone; art: DeckArt | null; colors: string[] }) {
  const { slide } = plan;
  const head = <RunningHead deck={deck} tone={tone} art={art} />;
  const mark = (text: string) => <Marked text={text} colors={colors} />;
  const italicNumeral = (text: string, size: number) => (
    <span style={{ ...SERIF, fontStyle: 'italic', fontSize: u(size), color: tone.color }}>{text}</span>
  );

  switch (plan.template) {
    case 'title':
      return (
        <>
          <div className="absolute flex flex-col justify-center" style={{ left: u(80), right: art ? u(560) : u(80), top: u(80), bottom: u(80) }}>
            {deck.unit ? <p style={{ ...CAPS, fontSize: u(15), color: tone.muted, marginBottom: u(28) }}>{deck.unit}</p> : null}
            <h1 style={{ ...SERIF, fontSize: u(slide.title.length > 24 ? 84 : 112), lineHeight: 0.92, letterSpacing: '-0.02em' }}>{slide.title}</h1>
            {slide.subtitle ? (
              <p style={{ ...SERIF, fontStyle: 'italic', fontSize: u(42), lineHeight: 1.1, color: tone.accent, marginTop: u(18) }}>{slide.subtitle}</p>
            ) : null}
            <div aria-hidden style={{ width: u(72), borderTop: `3px solid ${tone.color}`, marginTop: u(36) }} />
            {slide.course ? <Detail tone={tone}>{slide.course}</Detail> : null}
          </div>
          {art ? (
            <>
              <Plate art={art} style={{ right: u(76), top: u(132), width: u(492), height: u(382) }} />
              <div className="absolute" style={{ right: u(76), top: u(536), width: u(492) }}>
                <WallLabel art={art} tone={tone} />
              </div>
            </>
          ) : null}
        </>
      );

    case 'agenda':
      return (
        <>
          {head}
          <div className="absolute flex flex-col justify-center" style={{ left: u(80), width: u(380), top: u(110), bottom: u(72), gap: u(22) }}>
            <p data-testid="gallery-mode" style={{ ...SERIF, fontStyle: 'italic', fontSize: u(54), lineHeight: 1.0, color: tone.accent }}>
              {plan.mode}
            </p>
            {slide.body ? <Detail tone={tone}>{slide.body}</Detail> : null}
          </div>
          <div className="absolute flex flex-col justify-center" style={{ left: u(500), right: u(80), top: u(110), bottom: u(72) }}>
            <Rows
              tone={tone}
              rows={(slide.agenda ?? (slide.bullets ?? []).map((title) => ({ title, minutes: undefined }))).map((item, i) => ({
                lead: italicNumeral(`${ROMAN[i] ?? i + 1}.`, 30),
                text: item.title,
                trail: item.minutes ? `${item.minutes} min` : undefined,
              }))}
            />
          </div>
        </>
      );

    case 'steps': {
      const steps = (slide.bullets ?? []).slice(0, 4);
      return (
        <>
          {head}
          <div className="absolute flex items-baseline" style={{ left: u(80), right: u(80), top: u(140), gap: u(22) }}>
            <Mode text={plan.mode} tone={tone} />
            <div className="flex-1">
              <Headline>{slide.title}</Headline>
            </div>
            {slide.minutes ? <Chip tone={tone}>{slide.minutes} min</Chip> : null}
          </div>
          <div className="absolute grid" style={{ left: u(80), right: u(80), top: u(260), bottom: u(36), gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, 1fr)` }}>
            {steps.map((text, i) => (
              <div key={i} style={{ paddingLeft: i ? u(46) : 0, paddingRight: u(46), borderLeft: i ? `1px solid ${tone.rule}` : undefined }}>
                <p style={{ ...SERIF, fontSize: u(82), lineHeight: 0.9, color: tone.color }}>{i + 1}</p>
                <p style={{ ...SANS, fontSize: u(26), lineHeight: 1.4, marginTop: u(14) }}>{mark(text)}</p>
              </div>
            ))}
          </div>
        </>
      );
    }

    case 'discuss': {
      const question = slide.question ?? slide.body ?? slide.title;
      const chip = [slide.grouping, slide.minutes && !slide.grouping?.includes('min') ? `${slide.minutes} min` : null].filter(Boolean).join(' · ');
      return (
        <>
          {head}
          <div className="absolute flex flex-col justify-center" style={{ left: u(80), right: u(150), top: u(110), bottom: u(60), gap: u(26) }}>
            <div className="flex items-center" style={{ gap: u(22) }}>
              <Mode text={plan.mode} tone={tone} />
              {chip ? <Chip tone={tone}>{chip}</Chip> : null}
            </div>
            <Prompt text={question} colors={colors} tone={tone} />
            {slide.choices?.length ? (
              <Rows
                tone={tone}
                rows={slide.choices.map((choice, i) => ({
                  lead: italicNumeral(`${'abcde'[i]}.`, 30),
                  text: mark(choice),
                  band: slide.answer === i + 1 ? band(plan.color) : undefined,
                }))}
              />
            ) : null}
            {slide.stem ? (
              <div className="flex items-baseline" style={{ gap: u(48), borderTop: `1px solid ${tone.rule}`, paddingTop: u(26) }}>
                <span style={{ ...CAPS, fontSize: u(15), color: tone.muted }}>Try</span>
                <span style={{ ...SERIF, fontStyle: 'italic', fontSize: u(30) }}>{slide.stem}</span>
              </div>
            ) : null}
            {slide.followUp ? <Detail tone={tone}>{slide.followUp}</Detail> : null}
          </div>
        </>
      );
    }

    case 'big_idea': {
      const left = plan.showArt && art ? 410 : 80;
      return (
        <>
          {plan.showArt && art ? (
            <img aria-hidden alt="" src={art.crops.strip} className="absolute object-cover" style={{ left: 0, top: 0, bottom: 0, width: u(330), height: '100%' }} />
          ) : null}
          <RunningHead deck={deck} tone={tone} art={art} left={left} swatch={!plan.showArt} />
          <div className="absolute flex flex-col justify-center" style={{ left: u(left), right: u(60), top: u(110), bottom: u(72), gap: u(26) }}>
            <Mode text={plan.mode} tone={tone} />
            <Prompt text={slide.body ?? slide.title} colors={colors} tone={tone} accentWord={slide.accentWord} />
            {slide.followUp ? <Detail tone={tone}>{slide.followUp}</Detail> : null}
          </div>
          {plan.showArt && art ? (
            <div className="absolute" style={{ left: u(left), right: u(80), bottom: u(28) }}>
              <WallLabel art={art} tone={tone} compact />
            </div>
          ) : null}
        </>
      );
    }

    case 'write': {
      const minutes = slide.seconds ? Math.max(1, Math.round(slide.seconds / 60)) : slide.minutes;
      const footer = [slide.routine, slide.stem ?? slide.followUp].filter(Boolean).join(' · ');
      return (
        <>
          {head}
          <div className="absolute flex flex-col justify-center" style={{ left: u(80), right: u(150), top: u(110), bottom: u(120), gap: u(30) }}>
            <Mode text={plan.mode} tone={tone} />
            <Prompt text={slide.body ?? slide.question ?? slide.title} colors={colors} tone={tone} accentWord={slide.accentWord} light />
          </div>
          <div className="absolute flex items-end justify-between" style={{ left: u(80), right: u(80), bottom: u(40), borderTop: `1px solid ${tone.rule}`, paddingTop: u(24) }}>
            <Detail tone={tone} size={19}>{footer}</Detail>
            {minutes ? (
              <span className="flex items-baseline" style={{ gap: u(12) }}>
                <span style={{ ...SERIF, fontSize: u(56), lineHeight: 0.8 }}>{minutes}</span>
                <span style={{ ...CAPS, fontSize: u(17), color: tone.muted }}>{minutes === 1 ? 'minute' : 'minutes'}</span>
              </span>
            ) : null}
          </div>
        </>
      );
    }

    case 'notes': {
      const timeline = (slide.timeline ?? []).slice(0, 5);
      const facts = (slide.facts ?? (timeline.length ? [] : slide.bullets ?? [])).slice(0, 3);
      return (
        <>
          {head}
          <div className="absolute flex items-baseline" style={{ left: u(80), right: u(80), top: u(140), gap: u(22) }}>
            <Mode text={plan.mode} tone={tone} />
            <Headline>{slide.title}</Headline>
          </div>
          {timeline.length ? (
            <div className="absolute" style={{ left: u(80), right: u(30), top: u(244) }}>
              <div className="absolute" style={{ left: u(9), right: 0, top: u(9), borderTop: `2px solid ${tone.ink}` }} />
              <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${timeline.length}, 1fr)` }}>
                {timeline.map((entry, i) => {
                  const accent = entry.mark === 'accent';
                  return (
                    <li key={i} className="flex flex-col" style={{ gap: u(8) }}>
                      <span
                        aria-hidden
                        style={{
                          width: u(18),
                          height: u(18),
                          borderRadius: '50%',
                          border: `2px solid ${entry.mark === 'ink' ? tone.ink : accent ? tone.color : tone.ink}`,
                          background: entry.mark === 'ink' ? tone.ink : accent ? tone.color : C.paper,
                        }}
                      />
                      <span style={{ ...SERIF, fontSize: u(37), lineHeight: 1, marginTop: u(14), color: accent ? tone.color : tone.ink }}>{entry.year}</span>
                      <span style={{ ...SANS, fontSize: u(18), lineHeight: 1.4, color: tone.muted, paddingRight: u(20) }}>{entry.caption}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
          {facts.length ? (
            <div
              className="absolute grid"
              style={{ left: u(80), right: u(80), ...(timeline.length ? { bottom: u(40) } : { top: u(250) }), borderTop: `1px solid ${tone.rule}`, paddingTop: u(26), gridTemplateColumns: `repeat(${facts.length}, 1fr)`, gap: u(48) }}
            >
              {facts.map((fact, i) => (
                <p key={i} style={{ ...SANS, fontSize: u(22), lineHeight: 1.45 }}>
                  {mark(fact)}
                </p>
              ))}
            </div>
          ) : null}
        </>
      );
    }

    case 'divider':
      return plan.ground === 'art' && art ? (
        <>
          <img src={art.crops.divider} alt={`${art.title}, ${art.artist} (detail)`} className="absolute object-cover" style={{ left: 0, top: 0, bottom: 0, width: u(768), height: '100%' }} />
          <div className="absolute flex flex-col justify-center" style={{ left: u(826), right: u(70), top: u(80), bottom: u(80), gap: u(18) }}>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={78}>{slide.title}</Headline>
            <div aria-hidden style={{ width: u(58), borderTop: `3px solid ${tone.color}`, marginTop: u(16) }} />
            {slide.subtitle ? <p style={{ ...SANS, fontSize: u(21), lineHeight: 1.5, marginTop: u(10) }}>{slide.subtitle}</p> : null}
          </div>
          <div className="absolute" style={{ left: u(826), right: u(70), bottom: u(48) }}>
            <p data-testid="gallery-credit" style={{ ...SANS, fontSize: u(14), color: tone.muted }}>
              {art.artist}, <em>{art.title}</em> (detail), {art.year}
            </p>
          </div>
        </>
      ) : (
        <div className="absolute flex flex-col justify-center" style={{ left: u(80), right: u(80), top: u(80), bottom: u(80), gap: u(18) }}>
          <Mode text={plan.mode} tone={tone} />
          <Headline size={78}>{slide.title}</Headline>
          <div aria-hidden style={{ width: u(58), borderTop: `3px solid ${tone.color}`, marginTop: u(16) }} />
          {slide.subtitle ? <p style={{ ...SANS, fontSize: u(21), lineHeight: 1.5, marginTop: u(10) }}>{slide.subtitle}</p> : null}
        </div>
      );

    case 'read':
      return (
        <>
          {head}
          <div className="absolute flex flex-col justify-center" style={{ left: u(80), width: u(400), top: u(110), bottom: u(72), gap: u(20) }}>
            <Mode text={plan.mode} tone={tone} />
            <Headline>{slide.title}</Headline>
            {[slide.subtitle ?? slide.body, slide.work ? `${slide.work}${slide.page ? ` · ${slide.page}` : ''}` : null]
              .filter(Boolean)
              .map((line, i) => (
                <Detail key={i} tone={tone}>
                  {line}
                </Detail>
              ))}
          </div>
          <div className="absolute flex flex-col justify-center" style={{ left: u(530), right: u(80), top: u(110), bottom: u(72) }}>
            <Rows
              tone={tone}
              rows={
                slide.tasks?.length
                  ? slide.tasks.slice(0, 3).map((task) => ({ lead: <span style={{ ...SERIF, fontStyle: 'italic', fontSize: u(32), color: tone.color, display: 'inline-block', minWidth: u(150) }}>{task.verb}</span>, text: mark(task.text) }))
                  : (slide.bullets ?? []).slice(0, 3).map((text) => ({ text: mark(text) }))
              }
            />
          </div>
        </>
      );

    case 'look': {
      const question = slide.question ?? slide.body ?? slide.title;
      const timing = [slide.seconds ? `${slide.seconds} seconds` : null, slide.routine].filter(Boolean).join(' · ');
      return (
        <>
          {plan.showArt && art ? (
            <>
              <div className="absolute" style={{ left: u(64), top: u(74), width: u(720), height: u(538) }}>
                <img src={art.src} alt={`${art.title}, ${art.artist}`} className="h-full w-full object-contain" />
              </div>
              <div className="absolute" style={{ left: u(64), top: u(624), width: u(720) }}>
                <WallLabel art={art} tone={tone} compact />
              </div>
            </>
          ) : null}
          <div className="absolute flex flex-col justify-center" style={{ left: u(plan.showArt && art ? 846 : 80), right: u(70), top: u(80), bottom: u(80), gap: u(22) }}>
            <Mode text={plan.mode} tone={tone} />
            {timing ? <p style={{ ...CAPS, fontSize: u(16), color: tone.muted }}>{timing}</p> : null}
            <p style={{ ...SERIF, fontSize: u(plan.showArt && art ? 38 : promptTypeSize(question)), lineHeight: 1.15 }}>{mark(question)}</p>
            {slide.followUp ? <p style={{ ...SERIF, fontStyle: 'italic', fontSize: u(30), lineHeight: 1.25, color: tone.muted }}>{slide.followUp}</p> : null}
          </div>
        </>
      );
    }

    case 'excerpt':
      return (
        <>
          {head}
          <div
            className="absolute flex flex-col justify-center"
            style={{ left: u(80), width: u(726), top: u(206), bottom: u(176), background: C.sheet, padding: `${u(48)} ${u(56)}`, gap: u(24) }}
          >
            <p style={{ ...SERIF, fontSize: u(29), lineHeight: 1.45, color: C.ink, whiteSpace: 'pre-line' }}>{slide.body}</p>
            {slide.author || slide.attribution || slide.work ? (
              <p style={{ borderTop: `1px solid ${C.rule}`, paddingTop: u(18), color: C.ink }}>
                <span style={{ ...SANS, fontWeight: 700, fontSize: u(15) }}>{slide.author ?? slide.attribution}</span>
                {slide.work ? (
                  <>
                    <span style={{ ...SANS, fontSize: u(15) }}>, </span>
                    <span style={{ ...SERIF, fontStyle: 'italic', fontSize: u(17) }}>{slide.work}</span>
                  </>
                ) : null}
                {slide.page ? <span style={{ ...SANS, fontSize: u(15), color: C.stone, marginLeft: u(14) }}>p. {slide.page.replace(/^p+\.\s*/i, '')}</span> : null}
              </p>
            ) : null}
          </div>
          <div className="absolute flex flex-col justify-center" style={{ left: u(870), right: u(80), top: u(110), bottom: u(72), gap: u(20) }}>
            <Mode text={plan.mode} tone={tone} />
            <ol className="flex flex-col" style={{ borderBottom: `1px solid ${tone.rule}` }}>
              {(slide.tasks?.length ? slide.tasks.map((task) => ({ verb: task.verb, text: task.text })) : (slide.bullets ?? []).map((text) => ({ verb: '', text }))).slice(0, 3).map((task, i) => (
                <li key={i} style={{ ...SANS, fontSize: u(22), lineHeight: 1.4, padding: `${u(18)} 0`, borderTop: `1px solid ${tone.rule}` }}>
                  {task.verb ? <strong style={{ fontWeight: 700 }}>{task.verb} </strong> : null}
                  {mark(task.text)}
                </li>
              ))}
            </ol>
          </div>
        </>
      );

    case 'exit':
      return (
        <>
          <RunningHead deck={deck} tone={tone} art={art} swatch={false} />
          <div className="absolute flex flex-col justify-center" style={{ left: u(80), right: u(art ? 400 : 120), top: u(110), bottom: u(72), gap: u(28) }}>
            <Mode text={plan.mode} tone={tone} />
            <p style={{ ...SERIF, fontSize: u(promptTypeSize(slide.body ?? slide.title) - 8), lineHeight: 1.15 }}>{mark(slide.body ?? slide.title)}</p>
            {slide.button ? (
              <div className="flex items-center" style={{ gap: u(20) }}>
                <span data-testid="gallery-yawp-button" style={{ ...SANS, fontWeight: 700, fontSize: u(19), color: C.ink, background: '#F7F1EA', borderRadius: 999, padding: `${u(14)} ${u(24)}` }}>
                  Open Yawp! → {slide.button}
                </span>
                <span style={{ ...SANS, fontSize: u(18), color: tone.muted }}>or finish it on paper</span>
              </div>
            ) : null}
          </div>
          {art ? (
            <div className="absolute flex flex-col" style={{ right: u(80), top: u(262), width: u(270), gap: u(14) }}>
              <div style={{ background: '#F7F1EA', padding: u(16), height: u(212) }}>
                <img src={art.src} alt="" className="h-full w-full object-cover" />
              </div>
              {slide.nextLesson ? <p style={{ ...SANS, fontSize: u(15), color: tone.muted }}>Next time: {slide.nextLesson}</p> : null}
            </div>
          ) : slide.nextLesson ? (
            <p className="absolute" style={{ ...SANS, fontSize: u(15), color: tone.muted, left: u(80), bottom: u(60) }}>
              Next time: {slide.nextLesson}
            </p>
          ) : null}
        </>
      );

    case 'compare':
      return (
        <>
          {head}
          <div className="absolute flex flex-col" style={{ left: u(80), right: u(80), top: u(140), gap: u(30) }}>
            <Headline>{slide.title}</Headline>
            <div className="grid grid-cols-2" style={{ gap: u(56) }}>
              {[slide.left, slide.right].map((column, i) =>
                column ? (
                  <div key={i} className="flex flex-col" style={{ gap: u(12), borderTop: `1px solid ${tone.rule}`, paddingTop: u(18) }}>
                    <span style={{ ...SERIF, fontStyle: 'italic', fontSize: u(30), color: tone.color }}>{column.label}</span>
                    <span style={{ ...SANS, fontSize: u(24), lineHeight: 1.45 }}>{mark(column.text)}</span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </>
      );
  }
}

