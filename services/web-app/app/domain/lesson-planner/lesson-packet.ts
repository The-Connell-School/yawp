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

export type PacketSectionInput = {
  id: string;
  content: string;
  keptAudience?: string | null;
};

export type PacketSection = {
  id: string;
  title: string;
  content: string;
  audience: PacketAudience;
};

export type PacketOutlineEntry = {
  title: string;
  minutes: number | null;
  steps: string[];
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
    const { body } = parseAssistantMessage(section.content);
    const title = deriveSectionTitle(body, index);
    return {
      id: section.id,
      title,
      content: stripDuplicateTitleHeading(body.trim(), title),
      audience: parsePacketAudience(section.keptAudience),
    };
  });

  const outline = built.map((section) => ({
    title: section.title,
    minutes: readMinutes(section.title),
    steps: readSteps(section.content, section.title),
  }));

  return {
    title: title.trim() || 'Lesson plan',
    className,
    sections: built,
    outline,
    totalMinutes: outline.reduce(
      (total, entry) => total + (entry.minutes ?? 0),
      0
    ),
  };
}
