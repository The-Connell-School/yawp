/**
 * Links in a lesson plan have to open.
 *
 * The planner is told to build lessons out of real Yawp material and to hand
 * back real links, and it is told never to invent one. It invents them anyway —
 * a "Body Paragraphs Slide Deck" that sounds exactly like something the Lounge
 * would hold, linked to a route that does not exist. A teacher clicking it in
 * front of a class gets a dead page, which is worse than never being offered
 * the link at all.
 *
 * The app knows which links are real: every one it should ever write came back
 * from a catalog tool during this same request. So the reply is checked against
 * that set, and a link the tools never returned loses its href and keeps its
 * words. The plan still reads; it just stops promising a page.
 */

/** Keys whose string values are somewhere a teacher could be sent. */
const LINK_KEY = /(href|url)$/i;

function collectFrom(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFrom(item, into);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === 'string' && LINK_KEY.test(key)) {
      const trimmed = nested.trim();
      if (trimmed) into.add(trimmed);
    } else {
      collectFrom(nested, into);
    }
  }
}

/**
 * Every link a tool result handed back, at any depth.
 *
 * Takes the raw JSON the tool returned rather than a parsed object, because
 * that is the shape the request loop already has. A result that will not parse
 * contributes nothing — better to strip a real link than to trust a broken one.
 */
export function collectToolLinks(toolResultJson: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolResultJson);
  } catch {
    return [];
  }
  const links = new Set<string>();
  collectFrom(parsed, links);
  return [...links];
}

/** `[text](href)`, and the bare `<href>` autolink Markdown also allows. */
const MARKDOWN_LINK = /\[([^\]\n]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

/**
 * Does this href point at a page, or at somewhere already on the screen?
 *
 * In-page anchors are the planner's own headings and the packet's own sections;
 * nothing was invented and there is nothing to check.
 */
function isInPageAnchor(href: string): boolean {
  return href.startsWith('#');
}

/** mailto:, tel: — not a page, and not something the catalog would return. */
const NON_PAGE_SCHEME = /^(mailto|tel):/i;

function normalizeLink(href: string): string {
  // A trailing slash or a query string is the same page; a fragment is a place
  // within it. None of them make a link the tools returned into a made-up one.
  return href
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

export type LinkCheck = {
  /** The reply with unverifiable links reduced to their text. */
  reply: string;
  /** The hrefs that were taken out, for logging. */
  removed: string[];
};

/**
 * Strip every link the catalog never handed back.
 *
 * The link text stays exactly where it was: "Yawp's Body Paragraphs deck covers
 * this" is still a sentence worth reading once it stops pretending to be a
 * link, and cutting it would leave a hole in the middle of a lesson step.
 */
export function verifyLessonLinks(
  reply: string,
  toolLinks: Iterable<string>
): LinkCheck {
  const allowed = new Set<string>();
  for (const link of toolLinks) allowed.add(normalizeLink(link));

  const removed: string[] = [];
  const checked = reply.replace(MARKDOWN_LINK, (match, text: string, href) => {
    const target = String(href);
    if (isInPageAnchor(target) || NON_PAGE_SCHEME.test(target)) return match;
    if (allowed.has(normalizeLink(target))) return match;
    removed.push(target);
    // Markdown emphasis in the text survives; only the link wrapper goes.
    return text;
  });

  return { reply: checked, removed };
}
