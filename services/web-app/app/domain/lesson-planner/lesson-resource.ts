/**
 * Yawp material, brought into the lesson instead of pointed at.
 *
 * The planner used to write "Use the Body Paragraphs Slide Deck from the
 * Teacher's Lounge (Lesson 5)" — which is a set of directions, not a deck. The
 * teacher has to leave the plan, find the Lounge, find the course, find the
 * module, and find the file, and every one of those steps is a chance to give
 * up. The catalog tools already hand back a direct address for the file
 * itself, so the plan can carry the thing rather than its location.
 *
 * A block names one piece of real Yawp material and says what to do with it.
 * The app renders it as something to open.
 */

export const RESOURCE_FENCE = 'yawp-resource';

/** What the material is, which decides the icon and the verb on the button. */
export const RESOURCE_KINDS = ['slides', 'document', 'lesson', 'link'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type LessonResource = {
  title: string;
  href: string;
  kind: ResourceKind;
  /** How to use it in this lesson — which slides, where to stop. */
  note: string;
};

const RESOURCE_BLOCK = new RegExp(
  '```+' + RESOURCE_FENCE + '[^\\n]*\\n([\\s\\S]*?)```+',
  'g'
);

const MAX_TITLE_CHARS = 120;
const MAX_NOTE_CHARS = 400;

function readKind(raw: string | undefined): ResourceKind {
  const value = raw?.trim().toLowerCase();
  return (RESOURCE_KINDS as readonly string[]).includes(value ?? '')
    ? (value as ResourceKind)
    : 'document';
}

/**
 * The material blocks in a reply, and the reply without them.
 *
 * A block missing a title or an address is not material — it is the model
 * gesturing at something — so it is dropped rather than rendered as an empty
 * card.
 */
export function readLessonResources(content: string): {
  resources: LessonResource[];
  body: string;
} {
  const resources: LessonResource[] = [];
  let body = content;

  for (const match of content.matchAll(RESOURCE_BLOCK)) {
    body = body.replace(match[0], '');

    const lines = (match[1] ?? '').split('\n');
    const header: Record<string, string> = {};
    let index = 0;
    for (; index < lines.length; index += 1) {
      const line = lines[index]!;
      const field = /^\s*(title|href|url|kind)\s*:\s*(.+?)\s*$/i.exec(line);
      if (!field) break;
      header[field[1]!.toLowerCase()] = field[2]!;
    }

    const title = header.title?.trim();
    const href = (header.href ?? header.url)?.trim();
    if (!title || !href) continue;

    resources.push({
      title: title.slice(0, MAX_TITLE_CHARS),
      href,
      kind: readKind(header.kind),
      note: lines.slice(index).join('\n').trim().slice(0, MAX_NOTE_CHARS),
    });
  }

  if (body === content) return { resources, body: content };
  return { resources, body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

/** A link is the same page with or without its query string or fragment. */
function normalize(href: string): string {
  return href
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

/**
 * Drop any block pointing somewhere the catalog never returned.
 *
 * Same rule as the links in the prose: material the planner assembled an
 * address for is material that does not exist, and a card is a much louder way
 * to promise something than a sentence is. Run before the reply is stored, so
 * an invented resource never enters the conversation.
 */
export function verifyLessonResources(
  reply: string,
  toolLinks: Iterable<string>
): { reply: string; removed: string[] } {
  const allowed = new Set<string>();
  for (const link of toolLinks) allowed.add(normalize(link));

  const removed: string[] = [];
  const checked = reply.replace(RESOURCE_BLOCK, (block, inner: string) => {
    const href = /^\s*(?:href|url)\s*:\s*(.+?)\s*$/im.exec(inner ?? '')?.[1];
    if (href && allowed.has(normalize(href))) return block;
    if (href) removed.push(href);
    return '';
  });

  if (!removed.length) return { reply, removed };
  return { reply: checked.replace(/\n{3,}/g, '\n\n').trim(), removed };
}

/**
 * The same reply with each block rendered as a Markdown link, for the printed
 * packet — where there is no card to click, but the teacher still needs to
 * know which material the step depends on.
 */
export function inlineLessonResources(content: string): string {
  return content.replace(RESOURCE_BLOCK, (_block, inner: string) => {
    const { resources } = readLessonResources(
      '```' + RESOURCE_FENCE + '\n' + (inner ?? '') + '```'
    );
    const resource = resources[0];
    if (!resource) return '';
    return resource.note
      ? `**[${resource.title}](${resource.href})** — ${resource.note}`
      : `**[${resource.title}](${resource.href})**`;
  });
}
