/**
 * The gallery deck (Yawp! Lesson Deck Kit, "The gallery and the page"), drawn
 * on a 1280×720 design canvas that scales with its box: every size below is
 * the kit's pixel size, in `u` (1/1280 of the slide's width). Left-aligned,
 * 80px margins, no boxes or shadows, no slide numbers. The art is never under
 * text, and wherever it hangs it is credited.
 */
import type { CSSProperties, ReactNode } from 'react';
import { deckArt, type DeckArt } from '~/domain/lesson-planner/deck-art';
import {
  GALLERY_COLORS as C,
  GALLERY_FONTS,
  galleryAccent,
  galleryRunningHead,
  planGalleryDeck,
  promptTypeSize,
  type GallerySlidePlan,
} from '~/domain/lesson-planner/deck-gallery';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

export const GALLERY_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Libre+Franklin:wght@400;500;600&display=swap';

/** A kit pixel, at whatever size the slide is drawn. */
const u = (px: number) => `calc(${px} * 100cqw / 1280)`;

const SERIF: CSSProperties = { fontFamily: GALLERY_FONTS.serif, fontWeight: 500 };
const SANS: CSSProperties = { fontFamily: GALLERY_FONTS.sans };

type Tone = { ink: string; muted: string; accent: string; rule: string };

function toneFor(plan: GallerySlidePlan, accent: string): Tone {
  if (plan.dark) return { ink: C.white, muted: 'rgba(255,255,255,0.72)', accent: C.accentOnDark, rule: 'rgba(255,255,255,0.25)' };
  if (plan.ground === 'accent') return { ink: C.white, muted: 'rgba(255,255,255,0.82)', accent: C.white, rule: 'rgba(255,255,255,0.35)' };
  return { ink: C.ink, muted: C.stone, accent, rule: C.rule };
}

function background(plan: GallerySlidePlan, accent: string): string {
  if (plan.ground === 'pine') return C.pine;
  if (plan.ground === 'ink') return C.ink;
  if (plan.ground === 'accent') return accent;
  return C.paper;
}

export function GallerySlideCanvas({ deck, index }: { deck: SlideDeck; index: number }) {
  const plan = planGalleryDeck(deck)[index];
  if (!plan) return null;
  const accent = galleryAccent(deck);
  const tone = toneFor(plan, accent);
  const art = deckArt(deck.art);
  return (
    <div
      className="@container relative h-full w-full overflow-hidden"
      data-layout={plan.slide.layout}
      data-template={plan.template}
      data-ground={plan.ground}
      data-theme="gallery"
      style={{ ...SANS, background: background(plan, accent), color: tone.ink }}
    >
      <TemplateBody plan={plan} deck={deck} tone={tone} art={art} />
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

function RunningHead({ deck, tone, art, left = 80, right = 80 }: { deck: SlideDeck; tone: Tone; art: DeckArt | null; left?: number; right?: number }) {
  return (
    <div className="absolute" style={{ left: u(left), right: u(right), top: u(40) }}>
      <div className="flex items-center" style={{ gap: u(12), paddingBottom: u(12), borderBottom: `1px solid ${tone.rule}` }}>
        <span
          aria-hidden
          style={{
            width: u(14),
            height: u(14),
            flexShrink: 0,
            background: art ? `center / cover url(${art.src})` : tone.accent,
          }}
        />
        <span
          className="truncate uppercase"
          style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.muted }}
        >
          {galleryRunningHead(deck)}
        </span>
      </div>
    </div>
  );
}

function Mode({ text, tone, size = 42 }: { text: string | null; tone: Tone; size?: number }) {
  if (!text) return null;
  return (
    <p data-testid="gallery-mode" style={{ ...SERIF, fontStyle: 'italic', fontSize: u(size), lineHeight: 1.1, color: tone.accent }}>
      {text}
    </p>
  );
}

function Headline({ children, size = 62 }: { children: ReactNode; size?: number }) {
  return (
    <h2 style={{ ...SERIF, fontSize: u(size), lineHeight: 1.05, letterSpacing: '-0.01em' }}>{children}</h2>
  );
}

function Prompt({ text, tone, accentWord }: { text: string; tone: Tone; accentWord?: string }) {
  const size = promptTypeSize(text);
  return (
    <p style={{ ...SERIF, fontSize: u(size), lineHeight: 1.12, letterSpacing: '-0.01em' }}>
      <WithAccent text={text} word={accentWord} color={tone.accent} />
    </p>
  );
}

/** The one word the kit lets a big idea set in the accent. */
function WithAccent({ text, word, color }: { text: string; word?: string; color: string }) {
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

function Body({ children, tone, size = 25 }: { children: ReactNode; tone?: Tone; size?: number }) {
  return <p style={{ fontSize: u(size), lineHeight: 1.45, color: tone?.muted }}>{children}</p>;
}

function Credit({ art, tone }: { art: DeckArt; tone: Tone }) {
  return (
    <p data-testid="gallery-credit" style={{ fontSize: u(11), lineHeight: 1.4, color: tone.muted }}>
      {art.credit}
    </p>
  );
}

/** The main column, under the running head, inside the margins. */
function Column({ children, right = 80, left = 80, gap = 22 }: { children: ReactNode; right?: number; left?: number; gap?: number }) {
  return (
    <div className="absolute flex flex-col justify-center" style={{ left: u(left), right: u(right), top: u(110), bottom: u(72), gap: u(gap) }}>
      {children}
    </div>
  );
}

function ListRows({ rows, tone }: { rows: { lead?: ReactNode; text: ReactNode; trail?: ReactNode }[]; tone: Tone }) {
  return (
    <ol className="flex flex-col" style={{ marginTop: u(8) }}>
      {rows.map((row, i) => (
        <li
          key={i}
          className="flex items-baseline"
          style={{ gap: u(24), padding: `${u(13)} 0`, borderTop: `1px solid ${tone.rule}`, fontSize: u(25), lineHeight: 1.35 }}
        >
          {row.lead !== undefined ? (
            <span style={{ ...SERIF, fontStyle: 'italic', fontSize: u(30), color: tone.accent, minWidth: u(34) }}>{row.lead}</span>
          ) : null}
          <span className="flex-1">{row.text}</span>
          {row.trail ? <span style={{ fontSize: u(18), color: tone.muted }}>{row.trail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function TemplateBody({ plan, deck, tone, art }: { plan: GallerySlidePlan; deck: SlideDeck; tone: Tone; art: DeckArt | null }) {
  const { slide } = plan;
  const head = <RunningHead deck={deck} tone={tone} art={art} />;

  switch (plan.template) {
    case 'title': {
      const long = slide.title.length > 28;
      return (
        <>
          <div className="absolute flex flex-col justify-end" style={{ left: u(80), right: art ? u(560) : u(80), top: u(80), bottom: u(96), gap: u(20) }}>
            {deck.unit ? (
              <p className="uppercase" style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.muted }}>
                {deck.unit}
              </p>
            ) : null}
            <h1 style={{ ...SERIF, fontSize: u(long ? 92 : 132), lineHeight: 0.98, letterSpacing: '-0.02em' }}>{slide.title}</h1>
            {slide.subtitle ? <Body tone={tone} size={27}>{slide.subtitle}</Body> : null}
          </div>
          {art ? (
            <div className="absolute flex flex-col" style={{ right: u(80), top: u(80), bottom: u(64), width: u(440), gap: u(10) }}>
              <img src={art.src} alt={`${art.title}, ${art.artist}`} className="min-h-0 flex-1 object-cover" style={{ width: '100%' }} />
              <Credit art={art} tone={tone} />
            </div>
          ) : null}
        </>
      );
    }

    case 'agenda':
      return (
        <>
          {head}
          <Column>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={60}>{slide.title}</Headline>
            <ListRows
              tone={tone}
              rows={(slide.agenda ?? (slide.bullets ?? []).map((title) => ({ title, minutes: undefined }))).map((item, i) => ({
                lead: i + 1,
                text: item.title,
                trail: item.minutes ? `${item.minutes} min` : undefined,
              }))}
            />
          </Column>
        </>
      );

    case 'steps':
      return (
        <>
          {head}
          <Column>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={60}>{slide.title}</Headline>
            <ListRows tone={tone} rows={(slide.bullets ?? []).map((text, i) => ({ lead: i + 1, text }))} />
          </Column>
        </>
      );

    case 'discuss':
      return (
        <>
          {head}
          <Column right={160}>
            <div className="flex items-baseline" style={{ gap: u(20) }}>
              <Mode text={plan.mode} tone={tone} />
              {slide.grouping ? (
                <span className="uppercase" style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.muted }}>
                  {slide.grouping}
                </span>
              ) : null}
            </div>
            <Prompt text={slide.question ?? slide.body ?? slide.title} tone={tone} accentWord={slide.accentWord} />
            {slide.stem ? <Body tone={tone}>Start with: <em>{slide.stem}</em></Body> : null}
            {slide.followUp ? <Body tone={tone} size={23}>Then: {slide.followUp}</Body> : null}
          </Column>
        </>
      );

    case 'big_idea':
      return (
        <>
          {art ? (
            <div aria-hidden className="absolute" style={{ left: 0, top: 0, bottom: 0, width: u(200), background: `center / cover url(${art.src})` }} />
          ) : null}
          <RunningHead deck={deck} tone={tone} art={art} left={art ? 260 : 80} />
          <Column left={art ? 260 : 80} right={140}>
            <Mode text={plan.mode} tone={tone} />
            <Prompt text={slide.body ?? slide.title} tone={tone} accentWord={slide.accentWord} />
            {slide.body ? <Body tone={tone}>{slide.title}</Body> : null}
          </Column>
          {art ? (
            <div className="absolute" style={{ left: u(260), right: u(80), bottom: u(28) }}>
              <Credit art={art} tone={tone} />
            </div>
          ) : null}
        </>
      );

    case 'write': {
      const minutes = slide.seconds ? Math.round(slide.seconds / 60) : slide.minutes;
      return (
        <>
          {head}
          <Column right={160}>
            <Mode text={plan.mode} tone={tone} />
            <Prompt text={slide.body ?? slide.question ?? slide.title} tone={tone} accentWord={slide.accentWord} />
            {slide.stem ? <Body tone={tone}>Start with: <em>{slide.stem}</em></Body> : null}
            {minutes ? (
              <p className="uppercase" style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.muted }}>
                {minutes} {minutes === 1 ? 'minute' : 'minutes'} · pens moving
              </p>
            ) : null}
          </Column>
        </>
      );
    }

    case 'notes': {
      const timeline = slide.timeline ?? [];
      return (
        <>
          {head}
          <Column>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={60}>{slide.title}</Headline>
            {timeline.length ? (
              <div className="relative" style={{ marginTop: u(24) }}>
                <div className="absolute" style={{ left: 0, right: 0, top: u(9), borderTop: `1px solid ${tone.rule}` }} />
                <ol className="relative flex" style={{ gap: u(24) }}>
                  {timeline.map((entry, i) => (
                    <li key={i} className="flex flex-1 flex-col" style={{ gap: u(10) }}>
                      <span
                        aria-hidden
                        style={{
                          width: u(18),
                          height: u(18),
                          borderRadius: '50%',
                          border: `2px solid ${entry.mark === 'ink' ? tone.ink : tone.accent}`,
                          background: entry.mark === 'open' ? C.paper : entry.mark === 'ink' ? tone.ink : tone.accent,
                        }}
                      />
                      <span style={{ ...SERIF, fontSize: u(34), lineHeight: 1 }}>{entry.year}</span>
                      <span style={{ fontSize: u(19), lineHeight: 1.35, color: tone.muted }}>{entry.caption}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {slide.facts?.length || (!timeline.length && slide.bullets?.length) ? (
              <ListRows tone={tone} rows={(slide.facts ?? slide.bullets ?? []).map((text) => ({ text }))} />
            ) : null}
          </Column>
        </>
      );
    }

    case 'divider':
      return plan.ground === 'art' && art ? (
        <>
          <div className="absolute flex flex-col" style={{ left: 0, top: 0, bottom: 0, width: u(768) }}>
            <img src={art.src} alt={`${art.title}, ${art.artist}`} className="h-full w-full object-cover" />
          </div>
          <div className="absolute flex flex-col justify-center" style={{ left: u(840), right: u(80), top: u(80), bottom: u(80), gap: u(20) }}>
            <Mode text={plan.mode} tone={tone} size={44} />
            <Headline size={60}>{slide.title}</Headline>
            {slide.subtitle ? <Body tone={tone}>{slide.subtitle}</Body> : null}
          </div>
          <div className="absolute" style={{ left: u(840), right: u(80), bottom: u(32) }}>
            <Credit art={art} tone={tone} />
          </div>
        </>
      ) : (
        <Column>
          <Mode text={plan.mode} tone={tone} size={44} />
          <Headline size={88}>{slide.title}</Headline>
          {slide.subtitle ? <Body tone={tone}>{slide.subtitle}</Body> : null}
        </Column>
      );

    case 'read':
      return (
        <>
          {head}
          <Column>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={60}>{slide.title}</Headline>
            {slide.work || slide.page ? (
              <Body tone={tone} size={23}>
                {[slide.work ? <em key="w">{slide.work}</em> : null, slide.page ? ` · ${slide.page}` : null]}
              </Body>
            ) : null}
            <ListRows
              tone={tone}
              rows={
                slide.tasks?.length
                  ? slide.tasks.map((task) => ({ lead: task.verb, text: task.text }))
                  : (slide.bullets ?? []).map((text) => ({ text }))
              }
            />
          </Column>
        </>
      );

    case 'look':
      return art ? (
        <>
          <div className="absolute flex flex-col" style={{ left: u(80), top: u(80), bottom: u(64), width: u(720), gap: u(10) }}>
            <img src={art.src} alt={`${art.title}, ${art.artist}`} className="min-h-0 w-full flex-1 object-cover" />
            <Credit art={art} tone={tone} />
          </div>
          <div className="absolute flex flex-col justify-center" style={{ left: u(860), right: u(80), top: u(80), bottom: u(80), gap: u(20) }}>
            <Mode text={plan.mode} tone={tone} />
            <p style={{ ...SERIF, fontSize: u(40), lineHeight: 1.15 }}>{slide.question ?? slide.body ?? slide.title}</p>
            {slide.routine ? (
              <p className="uppercase" style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.muted }}>
                {slide.routine}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {head}
          <Column right={160}>
            <Mode text={plan.mode} tone={tone} />
            <Prompt text={slide.question ?? slide.body ?? slide.title} tone={tone} />
            {slide.routine ? <Body tone={tone}>{slide.routine}</Body> : null}
          </Column>
        </>
      );

    case 'excerpt':
      return (
        <>
          {head}
          <Column right={700} gap={18}>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={52}>{slide.title}</Headline>
            {slide.bullets?.length ? (
              <ListRows tone={tone} rows={slide.bullets.map((text) => ({ text }))} />
            ) : null}
          </Column>
          <div
            className="absolute flex flex-col justify-center"
            style={{ left: u(640), right: u(80), top: u(110), bottom: u(72), background: C.sheet, padding: `${u(40)} ${u(48)}`, gap: u(18) }}
          >
            <p style={{ ...SERIF, fontSize: u(30), lineHeight: 1.4, color: C.ink }}>{slide.body}</p>
            {slide.author || slide.attribution || slide.work ? (
              <p style={{ fontSize: u(15), color: C.stone }}>
                — {[slide.author ?? slide.attribution, slide.work, slide.page].filter(Boolean).join(', ')}
              </p>
            ) : null}
          </div>
        </>
      );

    case 'exit':
      return (
        <>
          {head}
          <Column right={160}>
            <Mode text={plan.mode} tone={tone} size={44} />
            <Prompt text={slide.body ?? slide.title} tone={tone} accentWord={slide.accentWord} />
            {slide.nextLesson ? (
              <p className="uppercase" style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.muted }}>
                Next time · {slide.nextLesson}
              </p>
            ) : null}
          </Column>
        </>
      );

    case 'compare':
      return (
        <>
          {head}
          <Column>
            <Mode text={plan.mode} tone={tone} />
            <Headline size={52}>{slide.title}</Headline>
            <div className="grid grid-cols-2" style={{ gap: u(56), marginTop: u(8) }}>
              {[slide.left, slide.right].map((column, i) =>
                column ? (
                  <div key={i} className="flex flex-col" style={{ gap: u(10), borderTop: `1px solid ${tone.rule}`, paddingTop: u(14) }}>
                    <span className="uppercase" style={{ fontSize: u(13), letterSpacing: '0.16em', fontWeight: 600, color: tone.accent }}>
                      {column.label}
                    </span>
                    <span style={{ fontSize: u(23), lineHeight: 1.45 }}>{column.text}</span>
                  </div>
                ) : null
              )}
            </div>
          </Column>
        </>
      );
  }
}
