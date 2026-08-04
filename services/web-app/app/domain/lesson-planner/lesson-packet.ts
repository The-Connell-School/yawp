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
import { hasSlideDeck } from './slide-deck';
import { readLessonMaterials, type LessonMaterial } from './lesson-material';

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
    const { materials, body } = readLessonMaterials(withMaterials);
    const derivedTitle = deriveSectionTitle(body, index);
    const audience = parsePacketAudience(section.keptAudience);
    return {
      id: section.id,
      title: section.keptTitle?.trim() || derivedTitle,
      // Timing lives in the lesson's own heading, so a rename must not lose
      // it — the outline reads minutes from the derived title.
      derivedTitle,
      content: stripDuplicateTitleHeading(body.trim(), derivedTitle),
      audience,
      kind: section.kind ?? deriveSectionKind(body, audience),
      origin: section.origin ?? 'reply',
      materials,
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
