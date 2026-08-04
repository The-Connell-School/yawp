/**
 * The things a teacher actually hands out.
 *
 * A lesson plan that says "model with two versions of the same paragraph"
 * leaves the teacher to write both paragraphs at 7am, and a handout buried in a
 * collapsible is something to copy-paste, not something to use. So the planner
 * emits every piece of real material — a handout, a sample piece of writing, an
 * exit ticket, an answer key — as its own `yawp-material` block, and the app
 * turns each one into a thing with a name, a card, and a one-click route into
 * the printable packet.
 *
 * The body is plain Markdown after a short header, deliberately NOT JSON: a
 * whole handout escaped into a JSON string is exactly the fragile shape that
 * cost teachers their slide decks.
 */
import {
  parsePacketAudience,
  type PacketAudience,
  type PacketSectionKind,
} from './lesson-packet';

export const MATERIAL_FENCE = 'yawp-material';

export const MATERIAL_KINDS = [
  'handout',
  'sample',
  'exit-ticket',
  'answer-key',
  'rubric',
  'notes',
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** What each kind is called on its card and in the packet's contents. */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  handout: 'Handout',
  sample: 'Sample writing',
  'exit-ticket': 'Exit ticket',
  'answer-key': 'Answer key',
  rubric: 'Rubric',
  notes: 'Notes',
};

/**
 * Who a material is for when its header does not say. A handout and an exit
 * ticket go in students' hands and print with room to write; a key or a rubric
 * is the teacher's copy.
 */
const KIND_AUDIENCE: Record<MaterialKind, PacketAudience> = {
  handout: 'student',
  sample: 'student',
  'exit-ticket': 'student',
  'answer-key': 'teacher',
  rubric: 'teacher',
  notes: 'teacher',
};

const KIND_ALIASES: Record<string, MaterialKind> = {
  worksheet: 'handout',
  'graphic-organizer': 'handout',
  organizer: 'handout',
  practice: 'handout',
  'practice-set': 'handout',
  example: 'sample',
  model: 'sample',
  'model-text': 'sample',
  'sample-writing': 'sample',
  'mentor-text': 'sample',
  exit: 'exit-ticket',
  ticket: 'exit-ticket',
  key: 'answer-key',
  checklist: 'rubric',
  'teacher-notes': 'notes',
  script: 'notes',
};

export type LessonMaterial = {
  /** Stable within its reply, so adding the same material twice is one add. */
  key: string;
  kind: MaterialKind;
  title: string;
  audience: PacketAudience;
  /** Markdown, ready to render or print. */
  content: string;
};

const MATERIAL_BLOCK = new RegExp(
  '```+' + MATERIAL_FENCE + '[^\\n]*\\n([\\s\\S]*?)```+',
  'g'
);

const HEADER_LINE = /^([a-z][a-z_-]*)\s*:\s*(.*)$/i;
const HEADER_END = /^-{3,}\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.+)$/m;
const MAX_TITLE_CHARS = 120;

function readHeader(raw: string): {
  header: Record<string, string>;
  body: string;
} {
  const lines = raw.split('\n');
  const header: Record<string, string> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (HEADER_END.test(line)) {
      index += 1;
      break;
    }
    const match = line.match(HEADER_LINE);
    // The first line that is neither a header field nor the separator is the
    // start of the material — a block written with no header at all still works.
    if (!match) break;
    header[match[1]!.toLowerCase()] = match[2]!.trim();
    index += 1;
  }

  return { header, body: lines.slice(index).join('\n').trim() };
}

function readKind(raw: string | undefined): MaterialKind {
  const key = (raw ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if ((MATERIAL_KINDS as readonly string[]).includes(key)) {
    return key as MaterialKind;
  }
  // An unrecognised kind is still material the teacher asked for; a handout is
  // the safe reading, not a reason to throw the block away.
  return KIND_ALIASES[key] ?? 'handout';
}

function readTitle(
  header: Record<string, string>,
  body: string,
  kind: MaterialKind
): string {
  const given = header.title?.trim();
  if (given) return given.slice(0, MAX_TITLE_CHARS);
  const heading = body.match(HEADING)?.[1]?.trim();
  if (heading) return heading.slice(0, MAX_TITLE_CHARS);
  return MATERIAL_KIND_LABELS[kind];
}

/**
 * Split a reply into its prose and the materials it carries.
 *
 * The blocks are removed from the body: a material is shown as a card, never as
 * a wall of Markdown inside a code fence.
 */
export function readLessonMaterials(content: string): {
  materials: LessonMaterial[];
  body: string;
} {
  const materials: LessonMaterial[] = [];
  let body = content;

  for (const match of content.matchAll(MATERIAL_BLOCK)) {
    const { header, body: materialBody } = readHeader(match[1] ?? '');
    body = body.replace(match[0], '');
    if (!materialBody) continue;

    const kind = readKind(header.kind);
    materials.push({
      key: String(materials.length),
      kind,
      title: readTitle(header, materialBody, kind),
      audience: header.audience
        ? parsePacketAudience(header.audience)
        : KIND_AUDIENCE[kind],
      content: materialBody,
    });
  }

  // Only reflow when something was actually cut out; an untouched reply keeps
  // its own spacing.
  if (body === content) return { materials, body: content };
  return { materials, body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * Which pile a material lands in when the packet is browsed: the things you
 * hand out, or the things you read while teaching.
 */
export function packetKindForMaterial(kind: string): PacketSectionKind {
  return kind === 'handout' || kind === 'sample' || kind === 'exit-ticket'
    ? 'handout'
    : 'plan';
}

export function hasLessonMaterials(content: string): boolean {
  return readLessonMaterials(content).materials.length > 0;
}
