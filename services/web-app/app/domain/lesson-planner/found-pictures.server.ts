/**
 * Pictures that belong (Kevin, Nov 21; slides that teach, phase 2).
 *
 * The Leopard deck had one painting and no picture of Italy, Garibaldi or
 * anyone in the novel. The planner can now ask for a picture of the real
 * place or person: Yawp! searches an open collection (Wikimedia Commons),
 * keeps only what its license lets a school show (public domain, CC0, CC BY,
 * CC BY-SA), and stores a copy with the lesson, with the credit and license
 * it read from the collection. Like a map's pins, the model never writes a
 * picture's address or its credit: it names what the picture should show and
 * gets back the ids of pictures Yawp! has already checked and kept.
 *
 * Behind `lesson_planner_found_pictures`.
 */
import { imageDimensions, sniffPictureType } from '~/domain/office/image-dimensions';
import { cleanAltText, MAX_DECK_PICTURE_BYTES } from '~/domain/office/pptx-pictures';
import type { ReporterTool } from '~/domain/reporter/reporter-tools.server';

/** Wikimedia asks every client to say who it is and how to reach it. */
const USER_AGENT = process.env.PICTURE_FINDER_USER_AGENT ?? 'YawpLessonPlanner/1.0 (https://yawp.school; support@yawp.school)';

/**
 * What every request to Wikimedia carries: who is asking, and, when the
 * deployment has one, its API token. Without a token a server is counted with
 * every other anonymous client at its address and refused in bursts (Nov 22).
 */
export function wikimediaHeaders(): Record<string, string> {
  const token = process.env.WIKIMEDIA_ACCESS_TOKEN;
  return { 'user-agent': USER_AGENT, ...(token ? { authorization: `Bearer ${token}` } : {}) };
}
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Wide enough to fill half a projected slide. */
const MIN_WIDTH = 480;
const KEEP_PER_SEARCH = 3;
/** Several things searched at once keep two each: enough to choose from. */
const KEEP_PER_QUERY = 2;
const MAX_QUERIES = 4;
/**
 * The longest any one request to the collection may take. A lesson turn has
 * two minutes for everything; a picture is never worth the lesson (a unit
 * day on the preview timed out, Nov 21).
 */
const REQUEST_TIMEOUT_MS = 6_000;

export type FoundCandidate = {
  title: string;
  description: string;
  imageUrl: string;
  width: number;
  height: number;
  license: string;
  credit: string;
  sourceUrl: string;
};

export type KeptPicture = { id: string; for: string; shows: string; credit: string; license: string; width: number | null; height: number | null };

/** Where a kept picture goes: a row like the teacher's own pictures. */
export type PictureStore = {
  create(data: {
    membershipId: string;
    /** Null on a lesson's first turn, before the lesson is written; attached with it. */
    conversationId: string | null;
    position: number;
    slideNumbers: number[];
    altText: string;
    contentType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
    blob: Uint8Array;
    origin: 'found';
    credit: string;
    license: string;
    sourceUrl: string;
  }): Promise<{ id: string }>;
};

type Fetch = typeof fetch;

/** The planner's picture search, offered with `lesson_planner_found_pictures`. */
export const FIND_PICTURES_TOOL: ReporterTool = {
  name: 'find_pictures',
  description:
    'Find openly licensed pictures (public domain, CC0, CC BY, CC BY-SA) of a real person, place, thing or time for a slide: a portrait for a person slide, the real place for a picture slide. Say plainly what the picture should show, in English, with names and dates ("Giuseppe Garibaldi photograph", "Palermo harbour 19th century", "Dust Bowl farm 1936"). Ask for every picture the deck needs in one call, in `queries` (up to 4). Yawp! searches Wikimedia Commons, checks each license, keeps a few for each search with the lesson and returns their ids, what each shows and its credit. It takes a few seconds; call it once. Never use it for a film still, a book cover in copyright or a living person: those come from the teacher.',
  input_schema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        maxItems: MAX_QUERIES,
        description: 'Every picture the deck needs, one search each, with names and dates. Ask for them all in one call.',
      },
      query: { type: 'string', description: 'One picture, when only one is needed.' },
    },
  },
} as ReporterTool;

/** The license's short name when a school may show it; null otherwise. */
export function openLicense(short: string | null | undefined): string | null {
  const name = (short ?? '').replace(/<[^>]+>/g, '').trim();
  if (!name) return null;
  if (/\b(nc|nd)\b|non-?commercial|no-?deriv|fair use|copyright/i.test(name)) return null;
  if (/^public domain$/i.test(name) || /^pd([\s-]|$)/i.test(name)) return 'Public domain';
  if (/^cc0\b/i.test(name)) return 'CC0';
  const cc = name.match(/^cc[\s-]by(-sa)?(?:[\s-](\d(?:\.\d)?))?/i);
  if (cc) return `CC BY${cc[1] ? '-SA' : ''}${cc[2] ? ` ${cc[2]}` : ''}`;
  return null;
}

const plain = (html: unknown, max: number) => {
  const text = String(html ?? '')
    // Commons' hidden Wikidata line ("label QS:Len,\"Migrant Mother\"", preview, Nov 22) is not for people.
    .replace(/<(\w+)[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s*label QS:[\s\S]*$/i, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/** An artist or credit line as a slide shows it: a site's name for an address, nothing for "unknown". */
function cleanArtist(text: string): string {
  if (/^https?:\/\//i.test(text)) {
    try {
      const host = new URL(text.replace(/…$/, '')).hostname.replace(/^www\./, '');
      // A file store is not who made a picture ("s3.amazonaws.com" under Dickinson's portrait, Nov 22).
      return /amazonaws\.com$|cloudfront\.net$|googleusercontent\.com$|wikimedia\.org$/i.test(host) ? '' : host;
    } catch {
      return '';
    }
  }
  // "Unknown authorUnknown author": a template said twice.
  const half = text.length / 2;
  const once = Number.isInteger(half) && text.slice(0, half) === text.slice(half) ? text.slice(0, half) : text;
  return /^unknown( author| artist| photographer)?\.?$/i.test(once.trim()) ? '' : once;
}

export type CommonsPage = {
  index?: number;
  title?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    width?: number;
    height?: number;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: unknown } | undefined>;
  }>;
};

export class PictureSearchBusy extends Error {}

/** Openly licensed pictures matching what a slide needs, best first. */
export async function searchOpenPictures(
  query: string,
  { fetch: fetcher = fetch, limit = 8, timeoutMs = REQUEST_TIMEOUT_MS }: { fetch?: Fetch; limit?: number; timeoutMs?: number } = {}
): Promise<FoundCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
    iiextmetadatafilter: 'LicenseShortName|Artist|Credit|ImageDescription|ObjectName|DateTimeOriginal',
  });
  let response: Response;
  try {
    response = await fetcher(`${COMMONS_API}?${params}`, { headers: wikimediaHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    // No answer in time, or no connection: the same as busy.
    throw new PictureSearchBusy('timeout');
  }
  if (response.status === 429 || response.status >= 500) throw new PictureSearchBusy(String(response.status));
  if (!response.ok) return [];
  const body = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(body.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.flatMap((page) => {
    const candidate = candidateFromFile(page);
    return candidate ? [candidate] : [];
  });
}

/** A file's record as a picture a school may show, or null: no open license, too small, or not a photograph a browser draws. */
/** The work's own date, as Commons records it ("circa 1600-1610", "1890"): every year in it before 1900. */
function madeBefore1900(date: string): boolean {
  const years = [...date.matchAll(/\b(\d{3,4})\b/g)].map((m) => Number(m[1]));
  return years.length > 0 && years.every((year) => year < 1900);
}

export function candidateFromFile(page: CommonsPage, { minWidth = MIN_WIDTH }: { minWidth?: number } = {}): FoundCandidate | null {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const license = openLicense(meta.LicenseShortName?.value as string | undefined);
  const width = info.thumbwidth ?? info.width ?? 0;
  const height = info.thumbheight ?? info.height ?? 0;
  const imageUrl = info.thumburl ?? info.url;
  // What will be downloaded: a rendering says its type in its name (a TIFF's is a JPEG); else the file's own type.
  const named = /\.jpe?g(\?|$)/i.test(imageUrl ?? '') ? 'image/jpeg' : /\.png(\?|$)/i.test(imageUrl ?? '') ? 'image/png' : '';
  const type = info.thumburl ? named : (info.mime ?? named);
  if (!license || !imageUrl || width < minWidth || !/^image\/(jpeg|png)$/.test(type)) return null;
  // A file whose credit says its copyright is disputed is not one a school should show (Night, Nov 22),
  // except the museums' standard claim on a scan of an old work: the visuals test (Nov 23) lost the
  // Chandos portrait of Shakespeare (c. 1610) to it. A claim on a "mechanical reproduction" of a work
  // made before 1900 is kept; any other claim, or a later work, is still left out.
  const claimed = `${plain(meta.Artist?.value, 400)} ${plain(meta.Credit?.value, 400)}`;
  if (/copyright claims?/i.test(claimed) && !(/mechanical reproduction/i.test(claimed) && madeBefore1900(plain(meta.DateTimeOriginal?.value, 200))))
    return null;
  const title = plain(meta.ObjectName?.value, 100) || (page.title ?? '').replace(/^File:/, '').replace(/\.\w+$/, '');
  // Who made it; for a collection's scan with no artist, the collection's credit line.
  const artist = cleanArtist(plain(meta.Artist?.value, 80)) || cleanArtist(plain(meta.Credit?.value, 200));
  return {
    title,
    description: plain(meta.ImageDescription?.value, 200) || title,
    imageUrl,
    width,
    height,
    license,
    credit: [artist, title, license, 'via Wikimedia Commons'].filter(Boolean).join(', '),
    sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
  };
}

export async function downloadPicture(url: string, fetcher: Fetch, timeoutMs: number): Promise<Uint8Array | null> {
  const response = await fetcher(url, { headers: wikimediaHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) return null;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_DECK_PICTURE_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > MAX_DECK_PICTURE_BYTES ? null : bytes;
}

const BUSY_NOTE =
  'The picture collection is busy right now. Make the slide anyway, say in its speakerNotes which picture belongs there, and ask the teacher in one line under the deck to add one.';

/** One candidate downloaded, checked and kept with the lesson; null if it is not a picture or did not arrive in time. */
async function keep(
  candidate: FoundCandidate,
  query: string,
  owner: { membershipId: string; conversationId: string | null },
  deps: { fetch: Fetch; store: PictureStore; timeoutMs: number }
): Promise<KeptPicture | null> {
  const bytes = await downloadPicture(candidate.imageUrl, deps.fetch, deps.timeoutMs).catch(() => null);
  if (!bytes) return null;
  const contentType = sniffPictureType(bytes);
  if (!contentType) return null;
  const size = imageDimensions(bytes);
  const row = await deps.store.create({
    membershipId: owner.membershipId,
    conversationId: owner.conversationId,
    position: 0,
    slideNumbers: [],
    altText: cleanAltText(candidate.description),
    contentType,
    byteSize: bytes.byteLength,
    width: size?.width ?? null,
    height: size?.height ?? null,
    blob: bytes,
    origin: 'found',
    credit: candidate.credit,
    license: candidate.license,
    sourceUrl: candidate.sourceUrl,
  });
  return { id: row.id, for: query, shows: candidate.description, credit: candidate.credit, license: candidate.license, width: size?.width ?? null, height: size?.height ?? null };
}

/**
 * The planner's `find_pictures` tool: every picture a deck needs in one call
 * (`queries`, or one `query`). The searches run together, and each one's
 * downloads together, every request on a short timeout, so the whole call
 * takes seconds whatever the collection does. Kept pictures come back with
 * their ids, what each shows, its credit, and which search it was for.
 */
export async function findPicturesForLesson(
  input: Record<string, unknown>,
  owner: { membershipId: string; conversationId: string | null },
  deps: { fetch?: Fetch; store: PictureStore; timeoutMs?: number }
): Promise<{ pictures: KeptPicture[]; note: string }> {
  const fetcher = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const asked = Array.isArray(input.queries) ? input.queries : [input.query];
  const queries = [...new Set(asked.filter((query): query is string => typeof query === 'string').map((query) => query.trim().slice(0, 120)).filter(Boolean))].slice(0, MAX_QUERIES);
  if (!queries.length) return { pictures: [], note: 'Say what the picture should show: a person, a place or a thing, and when ("Giuseppe Garibaldi photograph", "Palermo 19th century").' };
  const perQuery = queries.length === 1 ? KEEP_PER_SEARCH : KEEP_PER_QUERY;
  let busy = 0;
  const results = await Promise.all(
    queries.map(async (query) => {
      let candidates: FoundCandidate[];
      try {
        candidates = await searchOpenPictures(query, { fetch: fetcher, timeoutMs });
      } catch {
        busy += 1;
        return [];
      }
      // A spare or two in case one does not arrive; never more than are kept and one over.
      const kept = await Promise.all(
        candidates.slice(0, perQuery + 1).map((candidate) => keep(candidate, query, owner, { fetch: fetcher, store: deps.store, timeoutMs }).catch(() => null))
      );
      return kept.filter((picture): picture is KeptPicture => picture !== null).slice(0, perQuery);
    })
  );
  const pictures = results.flat();
  if (!pictures.length && busy) return { pictures, note: BUSY_NOTE };
  return {
    pictures,
    note: pictures.length
      ? 'Put the id of the picture that truly shows what the slide is about in its `image` (a picture slide, or a person’s `image`); `for` says which search it came from. Yawp! shows its credit; never write the credit or a picture address yourself. Leave out any that do not fit, and for a search that found nothing, make the slide and ask the teacher for the picture.'
      : 'No openly licensed picture matched. Try a plainer search (the person’s full name, the place’s own name), or make the slide without one and ask the teacher for a picture.',
  };
}
