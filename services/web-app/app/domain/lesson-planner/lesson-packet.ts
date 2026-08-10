/**
 * The lesson packet: the thing a teacher actually walks away with.
 *
 * A planning conversation is a transcript, which is not a deliverable. The
 * teacher marks the replies worth keeping, and this turns those into one
 * printable document — named, dated, attributed to a class, with an outline
 * they can prop next to a laptop and handouts that print on their own pages
 * with room to write.
 */
import { parseAssistantMessage } from '~/components/ai-chat/parse-assistant-message';
import { hasSlideDeck, readSlideDeck, type SlideDeck } from './slide-deck';
import { readLessonMaterials, type LessonMaterial } from './lesson-material';
import { readLessonAsks } from './lesson-ask';
import { inlineDailyPagesExercises } from './daily-pages-block';
import { inlineLessonResources } from './lesson-resource';
import { inlineUnitPlan } from './unit-plan';

export const PACKET_AUDIENCES = ['teacher', 'student'] as const;

/**
 * Who a printed section is for. `teacher` is the plan they read while
 * teaching; `student` is a handout, which prints on a fresh page with writing
 * space and a name/date line.
 */
export type PacketAudience = (typeof PACKET_AUDIENCES)[number];

export function parsePacketAudience(value: unknown): PacketAudience {
  return PACKET_AUDIENCES.includes(value as PacketAudience)
    ? (value as PacketAudience)
    : 'teacher';
}

const MAX_FALLBACK_TITLE_CHARS = 80;

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim();
}

/**
 * A printable name for a kept reply: its first heading, else its opening
 * sentence, else its position in the packet.
 */
export function deriveSectionTitle(content: string, index: number): string {
  const heading = content.match(/^\s{0,3}#{1,6}\s+(.+)$/m);
  if (heading?.[1]) return stripInlineMarkdown(heading[1]);

  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine) {
    const sentence = firstLine.match(/^.*?[.!?](\s|$)/)?.[0] ?? firstLine;
    const cleaned = stripInlineMarkdown(sentence);
    if (cleaned.length > MAX_FALLBACK_TITLE_CHARS) {
      return `${cleaned.slice(0, MAX_FALLBACK_TITLE_CHARS - 1).trimEnd()}…`;
    }
    if (cleaned.length > 0) return cleaned;
  }

  return `Section ${index + 1}`;
}

/**
 * Minutes a section claims, read out of its title ("Warm-up (5 min)"). A range
 * counts as its upper bound so a period estimate never runs short.
 */
function readMinutes(title: string): number | null {
  const match = title.match(/(\d+)\s*(?:[–—-]\s*(\d+)\s*)?(?:min|minute)/i);
  if (!match) return null;
  const upper = match[2] ?? match[1];
  const minutes = Number(upper);
  return Number.isFinite(minutes) ? minutes : null;
}

/** Sub-headings inside a section, which become the steps under it. */
function readSteps(content: string, sectionTitle: string): string[] {
  return [...content.matchAll(/^\s{0,3}#{2,6}\s+(.+)$/gm)]
    .map((match) => stripInlineMarkdown(match[1]!))
    .filter((step) => step !== sectionTitle);
}

/**
 * Drop the reply's opening heading when it became the section title. The packet
 * renders the title itself, so leaving it in the body prints it twice — once as
 * the section heading and again as the first line of the section.
 */
function stripDuplicateTitleHeading(content: string, title: string): string {
  const lines = content.split('\n');
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstIndex === -1) return content;

  const heading = lines[firstIndex]!.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  if (!heading || stripInlineMarkdown(heading[1]!) !== title) return content;

  return lines
    .slice(firstIndex + 1)
    .join('\n')
    .trim();
}

export const PACKET_SECTION_KINDS = ['plan', 'handout', 'slides'] as const;

/**
 * What a saved resource is, so the packet can be browsed rather than only
 * read: `slides` to project, `handout` to give out, `plan` for the teacher.
 */
export type PacketSectionKind = (typeof PACKET_SECTION_KINDS)[number];

// A structured deck is unambiguous. The heading pattern is a fallback for a
// reply that describes slides in prose — still slide material to a teacher
// browsing their resources, even though it cannot be projected.
const SLIDE_HEADING = /^\s{0,3}#{1,6}\s+slide\s*\d/im;

export function deriveSectionKind(
  content: string,
  audience: PacketAudience
): PacketSectionKind {
  if (hasSlideDeck(content) || SLIDE_HEADING.test(content)) return 'slides';
  return audience === 'student' ? 'handout' : 'plan';
}

/**
 * Where a section came from. A kept `reply` is a whole turn of the plan, which
 * the teacher can rename; a `material` is one handout or sample the teacher
 * lifted out of a reply, and it arrives already named.
 */
export type PacketSectionOrigin = 'reply' | 'material';

export type PacketSectionInput = {
  id: string;
  content: string;
  keptAudience?: string | null;
  /** Teacher-supplied name; blank or absent falls back to the derived title. */
  keptTitle?: string | null;
  /** Known for a material; derived from the text for a kept reply. */
  kind?: PacketSectionKind;
  origin?: PacketSectionOrigin;
};

export type PacketSection = {
  id: string;
  title: string;
  content: string;
  audience: PacketAudience;
  kind: PacketSectionKind;
  origin: PacketSectionOrigin;
  /**
   * Material still sitting inside a kept reply, because the teacher kept the
   * whole plan rather than filing the handout on its own. It prints with the
   * section instead of being dropped or shown as a fence.
   */
  materials: LessonMaterial[];
  /**
   * The deck this section hands over, parsed once here rather than at each
   * point of render.
   *
   * Every renderer used to pull the `yawp-slides` fence out of `content`
   * itself, which worked until one of them forgot: the PDF passed the fence
   * straight to the Markdown drawer and a teacher downloaded four pages of raw
   * JSON. The packet is the one place that knows what a section is, so it is
   * the place to answer the question — `content` is prose by the time anyone
   * sees it, and the deck is here for whoever can render one.
   *
   * Null when the section has no deck, and also when it had one the schema
   * turned down: the JSON comes out of `content` either way, because a wall of
   * braces is the worst of the available outcomes.
   */
  deck: SlideDeck | null;
  /**
   * This section meant to carry a deck and the schema turned it down. Kept
   * apart from a plain absence so the page can say so quietly instead of
   * showing a gap where a deck was supposed to be.
   */
  deckFailed: boolean;
  /** Stable id for jump links from the contents index. */
  anchor: string;
};

export type PacketOutlineEntry = {
  title: string;
  minutes: number | null;
  steps: string[];
  kind: PacketSectionKind;
  anchor: string;
};

export type LessonPacket = {
  title: string;
  className: string | null;
  sections: PacketSection[];
  outline: PacketOutlineEntry[];
  /** Sum of the sections that named a duration; 0 when none did. */
  totalMinutes: number;
};

/**
 * The deck a download is asking for.
 *
 * Named by id when the teacher clicked a particular section's button, and
 * otherwise the packet's first deck — a hand-typed URL with no section on it
 * means "the slides", and most lessons have exactly one set. A section that
 * exists but carries no deck is nothing, not a fallback: pointing at the lesson
 * plan should fail rather than quietly hand back somebody else's slides.
 */
export function findDeckSection(
  packet: LessonPacket,
  sectionId: string | null | undefined
): { section: PacketSection; deck: SlideDeck } | null {
  const section = sectionId
    ? packet.sections.find((candidate) => candidate.id === sectionId)
    : packet.sections.find((candidate) => candidate.deck);

  return section?.deck ? { section, deck: section.deck } : null;
}

export function buildLessonPacket({
  title,
  className,
  sections,
}: {
  title: string;
  className: string | null;
  sections: PacketSectionInput[];
}): LessonPacket {
  const built = sections.map((section, index) => {
    // The suggestions block drives chat chips; it is not part of the lesson.
    const { body: withMaterials } = parseAssistantMessage(section.content);
    // A kept reply still carries its material blocks. They are rendered as
    // material, never as the raw fence — and their headings are parts of a
    // handout, not stages of the class, so they must come out before the
    // outline reads steps.
    const { materials, body: withAsks } = readLessonMaterials(withMaterials);
    // A kept intake turn still carries its control request. It is machinery, so
    // it is stripped rather than printed — the same reason the deck's JSON is.
    const { body: withWarmUps } = readLessonAsks(withAsks);
    // A warm-up the planner wrote is lesson content, not machinery: the packet
    // has no button to offer, so the prompt comes back as the blockquote it
    // would have been rather than as a fence printed on the page.
    // A unit map is a board on screen, where each day has a button. On paper
    // there is nothing to click, so it prints as the table a teacher can read
    // at a glance and write a date beside.
    const body = inlineUnitPlan(
      inlineLessonResources(inlineDailyPagesExercises(withWarmUps))
    );
    // The deck comes out of the prose and is carried as structure. Read from
    // `body` rather than the stripped text below, so a section is still slides
    // once its JSON is gone — including a deck that failed to validate, which
    // is slides the teacher meant to have.
    const deckOutcome = readSlideDeck(body);
    const prose = deckOutcome.kind === 'none' ? body : deckOutcome.body;
    const deck = deckOutcome.kind === 'deck' ? deckOutcome.deck : null;
    // A reply that was nothing but a deck has no prose to be named after, and
    // "Section 3" tells a teacher browsing their packet nothing. The deck came
    // with a title; use it.
    const derivedTitle =
      prose.trim() || !deck ? deriveSectionTitle(prose, index) : deck.title;
    const audience = parsePacketAudience(section.keptAudience);
    return {
      id: section.id,
      title: section.keptTitle?.trim() || derivedTitle,
      // Timing lives in the lesson's own heading, so a rename must not lose
      // it — the outline reads minutes from the derived title.
      derivedTitle,
      content: stripDuplicateTitleHeading(prose.trim(), derivedTitle),
      audience,
      kind: section.kind ?? deriveSectionKind(body, audience),
      origin: section.origin ?? 'reply',
      materials,
      deck,
      deckFailed: deckOutcome.kind === 'unreadable',
      anchor: `resource-${section.id}`,
    };
  });

  const outline = built.map((section) => ({
    title: section.title,
    minutes: readMinutes(section.derivedTitle),
    steps: readSteps(section.content, section.derivedTitle),
    kind: section.kind,
    anchor: section.anchor,
  }));

  return {
    title: title.trim() || 'Lesson plan',
    className,
    sections: built.map(({ derivedTitle: _derived, ...section }) => section),
    outline,
    totalMinutes: outline.reduce(
      (total, entry) => total + (entry.minutes ?? 0),
      0
    ),
  };
}
