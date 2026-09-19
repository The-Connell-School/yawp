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
import { fenceSlideDeck, readSlideDeck } from './slide-deck';

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

/** A lesson has one deck, so every version of it claims the same slot. */
export const DECK_SLOT = 'deck';
export const DECK_KIND = 'slides';

/**
 * Everything the packet can hold. A deck is not a material a teacher hands
 * out, but it is filed, replaced, and printed exactly like one.
 */
export type ArtifactKind = MaterialKind | typeof DECK_KIND;

/** What each kind is called on its card and in the packet's contents. */
export const MATERIAL_KIND_LABELS: Record<ArtifactKind, string> = {
  handout: 'Handout',
  sample: 'Sample writing',
  'exit-ticket': 'Exit ticket',
  'answer-key': 'Answer key',
  rubric: 'Rubric',
  notes: 'Notes',
  slides: 'Slides',
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
  /**
   * What this material IS, across the whole lesson — "handout:diagnose-repair".
   * A revision that claims the same slot takes the original's place in the
   * packet rather than piling up beside it.
   */
  slot: string;
  kind: ArtifactKind;
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

const MAX_SLOT_CHARS = 80;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLOT_CHARS) || 'untitled'
  );
}

/**
 * Where this material lives in the lesson.
 *
 * Derived from what it is, so a rebuild under the same name lands in the same
 * place. The planner can name the slot itself when it is revising something
 * whose title also changed — that is the only way a rename can still be a
 * replacement rather than a second copy.
 */
function readSlot(
  header: Record<string, string>,
  kind: MaterialKind,
  title: string
): string {
  const given = (header.slot ?? header.replaces)?.trim();
  if (given) return given.toLowerCase().slice(0, MAX_SLOT_CHARS);
  return `${kind}:${slugify(title)}`;
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
    const title = readTitle(header, materialBody, kind);
    materials.push({
      key: String(materials.length),
      slot: readSlot(header, kind, title),
      kind,
      title,
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
 * project, the things you hand out, or the things you read while teaching.
 */
export function packetKindForMaterial(kind: string): PacketSectionKind {
  if (kind === DECK_KIND) return 'slides';
  return kind === 'handout' || kind === 'sample' || kind === 'exit-ticket'
    ? 'handout'
    : 'plan';
}

/**
 * A deck, filed like everything else.
 *
 * Decks used to reach the packet only by keeping the whole reply, which meant a
 * revised deck sat beside the original with nothing to say which one to
 * project. Treating it as an artifact in the `deck` slot gives a lesson one
 * current deck. The stored content is the block itself, so the packet still
 * renders and presents it.
 */
export function deckAsMaterial(reply: string): LessonMaterial | null {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return null;
  return {
    key: DECK_SLOT,
    slot: DECK_SLOT,
    kind: DECK_KIND,
    title: outcome.deck.title,
    audience: 'teacher',
    content: fenceSlideDeck(outcome.deck),
  };
}

export function hasLessonMaterials(content: string): boolean {
  return readLessonMaterials(content).materials.length > 0;
}

/** Where a material's card sits on the page, for links from the plan itself. */
export function materialAnchor(key: string): string {
  return `material-${key}`;
}

/** Longer than this is a real name; shorter is a word the plan uses anyway. */
const MIN_LINKABLE_TITLE = 6;

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turn each mention of a material into a link to its card.
 *
 * A plan that says 'project the two drafts from the handout below ("Version A
 * vs. Version B")' is telling the teacher to go and look for something that is
 * already on the same screen. Naming it is enough; the app makes the name the
 * way there.
 *
 * Only the first mention of each material is linked — a step that refers to a
 * handout three times should not turn into three links — and a name already
 * inside a link or a heading is left alone.
 */
export function linkMaterialTitles(
  body: string,
  materials: Array<{ key: string; title: string }>
): string {
  const linkable = materials.filter(
    (material) => material.title.trim().length >= MIN_LINKABLE_TITLE
  );
  if (!linkable.length) return body;

  const linked = new Set<string>();
  let inFence = false;

  return body
    .split('\n')
    .map((line) => {
      if (/^\s{0,3}```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      // A heading that names the material IS the material's own title, and a
      // fenced block is machinery — neither is a mention to link.
      if (inFence || /^\s{0,3}#{1,6}\s/.test(line)) return line;

      let result = line;
      for (const material of linkable) {
        if (linked.has(material.key)) continue;
        const title = material.title.trim();
        const pattern = new RegExp(
          `(?<!\\[)\\b${escapeForRegExp(title)}\\b(?!\\]\\()`
        );
        if (!pattern.test(result)) continue;
        result = result.replace(
          pattern,
          `[${title}](#${materialAnchor(material.key)})`
        );
        linked.add(material.key);
      }
      return result;
    })
    .join('\n');
}
