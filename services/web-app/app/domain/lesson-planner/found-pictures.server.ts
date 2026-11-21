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

/** Wikimedia asks every client to say who it is and how to reach it. */
const USER_AGENT = process.env.PICTURE_FINDER_USER_AGENT ?? 'YawpLessonPlanner/1.0 (https://yawp.school; lesson pictures)';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Wide enough to fill half a projected slide. */
const MIN_WIDTH = 480;
const KEEP_PER_SEARCH = 3;

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

export type KeptPicture = { id: string; shows: string; credit: string; license: string; width: number | null; height: number | null };

/** Where a kept picture goes: a row like the teacher's own pictures. */
export type PictureStore = {
  create(data: {
    membershipId: string;
    conversationId: string;
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
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

type CommonsPage = {
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
export async function searchOpenPictures(query: string, { fetch: fetcher = fetch, limit = 8 }: { fetch?: Fetch; limit?: number } = {}): Promise<FoundCandidate[]> {
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
    iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|ObjectName',
  });
  const response = await fetcher(`${COMMONS_API}?${params}`, { headers: { 'user-agent': USER_AGENT } });
  if (response.status === 429 || response.status >= 500) throw new PictureSearchBusy(String(response.status));
  if (!response.ok) return [];
  const body = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(body.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info) return [];
    const meta = info.extmetadata ?? {};
    const license = openLicense(meta.LicenseShortName?.value as string | undefined);
    const width = info.thumbwidth ?? info.width ?? 0;
    const height = info.thumbheight ?? info.height ?? 0;
    const imageUrl = info.thumburl ?? info.url;
    if (!license || !imageUrl || width < MIN_WIDTH || !/^image\/(jpeg|png)$/.test(info.mime ?? '')) return [];
    const title = plain(meta.ObjectName?.value, 100) || (page.title ?? '').replace(/^File:/, '').replace(/\.\w+$/, '');
    const artist = plain(meta.Artist?.value, 80) || 'Unknown';
    return [
      {
        title,
        description: plain(meta.ImageDescription?.value, 200) || title,
        imageUrl,
        width,
        height,
        license,
        credit: `${artist}, ${title}, ${license}, via Wikimedia Commons`,
        sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
      },
    ];
  });
}

async function download(url: string, fetcher: Fetch): Promise<Uint8Array | null> {
  const response = await fetcher(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) return null;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_DECK_PICTURE_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > MAX_DECK_PICTURE_BYTES ? null : bytes;
}

/**
 * The planner's `find_pictures` tool: search, keep up to three with the
 * lesson, and hand back their ids, what each shows and its credit.
 */
export async function findPicturesForLesson(
  input: Record<string, unknown>,
  owner: { membershipId: string; conversationId: string },
  deps: { fetch?: Fetch; store: PictureStore }
): Promise<{ pictures: KeptPicture[]; note: string }> {
  const fetcher = deps.fetch ?? fetch;
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 120) : '';
  if (!query) return { pictures: [], note: 'Say what the picture should show: a person, a place or a thing, and when ("Giuseppe Garibaldi photograph", "Palermo 19th century").' };
  let candidates: FoundCandidate[];
  try {
    candidates = await searchOpenPictures(query, { fetch: fetcher });
  } catch {
    return { pictures: [], note: 'The picture collection is busy right now. Make the slide anyway, say in its speakerNotes which picture belongs there, and ask the teacher in one line under the deck to add one.' };
  }
  const pictures: KeptPicture[] = [];
  for (const candidate of candidates) {
    if (pictures.length >= KEEP_PER_SEARCH) break;
    const bytes = await download(candidate.imageUrl, fetcher).catch(() => null);
    if (!bytes) continue;
    const contentType = sniffPictureType(bytes);
    if (!contentType) continue;
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
    pictures.push({ id: row.id, shows: candidate.description, credit: candidate.credit, license: candidate.license, width: size?.width ?? null, height: size?.height ?? null });
  }
  return {
    pictures,
    note: pictures.length
      ? 'Put the id of the picture that truly shows what the slide is about in its `image` (a picture slide, or a person’s `image`). Yawp! shows its credit; never write the credit or a picture address yourself. Leave out any that do not fit.'
      : 'No openly licensed picture matched. Try a plainer search (the person’s full name, the place’s own name), or make the slide without one and ask the teacher for a picture.',
  };
}
