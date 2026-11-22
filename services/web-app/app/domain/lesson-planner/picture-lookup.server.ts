/**
 * Finding the pictures a deck wants (Kevin, Nov 22: dual coding).
 *
 * By subject, not by search. The planner names the thing a slide is about by
 * the title of its English Wikipedia article; the picture at the head of that
 * article is the one people chose to stand for it (Garibaldi's portrait, not
 * the aircraft carrier a search for his name returns). Wikipedia is asked for
 * free pictures only, the credit and license are read from the file's own
 * record, and anything that is not a picture of the thing (a locator map, a
 * logo, a file too small to project) is left out: no picture is better than a
 * wrong one.
 *
 * Two requests for a whole deck, then the downloads together, all inside a
 * hard limit, after the planner's reply is in hand: a picture never costs a
 * teacher the lesson. A picture kept once for a subject is reused without
 * asking again.
 */
import { imageDimensions, sniffPictureType } from '~/domain/office/image-dimensions';
import { cleanAltText } from '~/domain/office/pptx-pictures';
import { candidateFromFile, downloadPicture, wikimediaHeaders, type CommonsPage, type FoundCandidate, type PictureStore } from './found-pictures.server';
import { pictureKey, wantedPictures, withFoundPictures, withoutEmptyPictureSlides, type WantedPicture } from './picture-wants';
import { fenceSlideDeck, readSlideDeck, type SlideDeck } from './slide-deck';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
/** A deck's pictures are a dozen at most: enough for every teaching slide, and one request. */
const MAX_PICTURES = 12;
const MIN_WIDTH = 480;
/** A lead "image" that is not a picture of the thing: a map of where it is, a flag, a logo, a chart. */
const NOT_A_PICTURE = /\.svg$|(^|[\s_\-(])(map|maps|locator|location|flag|logo|seal|icon|diagram|chart|coat[\s_]of[\s_]arms|incorporated[\s_]and[\s_]unincorporated)([\s_\-).]|$)/i;

/** Wikipedia's own one-line description of an article says when it is a place people live. */
const A_PLACE = /\b(city|town|village|hamlet|suburb|borough|township|municipality|commune|census-designated place|neighbou?rhood|district|county|capital)\b/i;

/**
 * A town's lead picture is often some landmark in it (for Levittown,
 * Pennsylvania, a colonial house: live run, Nov 22). It is kept only when the
 * file is named for the town, as a skyline or a street of it is.
 */
function namedFor(file: string, article: string): boolean {
  const name = pictureKey(article.split(/[,(]/)[0] ?? article);
  return name.length > 2 && pictureKey(file).includes(name);
}

type Owner = { membershipId: string; conversationId: string | null };
type Fetch = typeof fetch;

/** Where found pictures are kept: this lesson's, and any kept before for the same subject. */
export type PictureShelf = {
  /** The newest picture kept for each of these subjects, by anyone: they are open pictures. */
  findKept(keys: string[]): Promise<Array<{ key: string; id: string }>>;
  /** That picture again, as this lesson's own. */
  copy(id: string, owner: Owner): Promise<{ id: string }>;
  create(data: Parameters<PictureStore['create']>[0] & { subject: string }): Promise<{ id: string }>;
};

export type PictureCounts = { wanted: number; filled: number; reused: number; empty: number };
export type ResolvedPictures<T> = { deck: T; ids: string[]; counts: PictureCounts; empty: Array<{ subject: string; why: 'none' | 'not a picture' | 'unavailable' }> };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function ask(params: Record<string, string>, fetcher: Fetch, timeoutMs: number, retryMs: number): Promise<any | null> {
  const url = `${WIKIPEDIA_API}?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, { headers: wikimediaHeaders(), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return null;
    }
    // Busy: once more after a breath, then give up.
    if (response.status === 429 && attempt === 0) {
      await sleep(retryMs);
      continue;
    }
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }
  return null;
}

const fileKey = (name: string) => name.replace(/^File:/i, '').replace(/_/g, ' ').trim();

/** Each subject's lead picture on Wikipedia, as a picture a school may show. */
async function lookUp(
  wanted: WantedPicture[],
  { fetcher, timeoutMs, retryMs }: { fetcher: Fetch; timeoutMs: number; retryMs: number }
): Promise<{ found: Map<string, FoundCandidate>; why: Map<string, 'none' | 'not a picture' | 'unavailable'> }> {
  const found = new Map<string, FoundCandidate>();
  const why = new Map<string, 'none' | 'not a picture' | 'unavailable'>();
  const pages = await ask(
    { redirects: '1', titles: wanted.map((want) => want.subject).join('|'), prop: 'pageimages|description', piprop: 'thumbnail|name', pithumbsize: '1280', pilicense: 'free' },
    fetcher,
    timeoutMs,
    retryMs
  );
  if (!pages?.query?.pages) {
    for (const want of wanted) why.set(pictureKey(want.subject), 'unavailable');
    return { found, why };
  }
  // A subject as written, to the article it is: through Wikipedia's own spelling and its redirects.
  const hops = new Map<string, string>();
  for (const hop of [...(pages.query.normalized ?? []), ...(pages.query.redirects ?? [])] as Array<{ from: string; to: string }>) hops.set(pictureKey(hop.from), hop.to);
  const articleOf = (subject: string) => {
    let title = subject;
    for (let i = 0; i < 4 && hops.has(pictureKey(title)); i += 1) title = hops.get(pictureKey(title))!;
    return pictureKey(title);
  };
  const leads = new Map<string, { file: string; width: number; fits: boolean }>();
  for (const page of Object.values(pages.query.pages) as Array<{ title?: string; description?: string; pageimage?: string; thumbnail?: { width?: number } }>) {
    if (!page.title || !page.pageimage) continue;
    const fits = !A_PLACE.test(page.description ?? '') || namedFor(page.pageimage, page.title);
    leads.set(pictureKey(page.title), { file: page.pageimage, width: page.thumbnail?.width ?? 0, fits });
  }
  const fileFor = new Map<string, string>();
  for (const want of wanted) {
    const key = pictureKey(want.subject);
    const lead = leads.get(articleOf(want.subject));
    if (!lead) why.set(key, 'none');
    else if (NOT_A_PICTURE.test(lead.file) || lead.width < MIN_WIDTH || !lead.fits) why.set(key, 'not a picture');
    else fileFor.set(key, lead.file);
  }
  if (!fileFor.size) return { found, why };

  const files = await ask(
    {
      titles: [...new Set(fileFor.values())].map((file) => `File:${file}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1280',
      iiextmetadatafilter: 'LicenseShortName|Artist|Credit|ImageDescription|ObjectName',
    },
    fetcher,
    timeoutMs,
    retryMs
  );
  const records = new Map<string, CommonsPage>();
  for (const page of Object.values(files?.query?.pages ?? {}) as CommonsPage[]) if (page.title) records.set(fileKey(page.title), page);
  for (const [key, file] of fileFor) {
    const record = records.get(fileKey(file));
    const candidate = record ? candidateFromFile(record) : null;
    if (candidate) found.set(key, candidate);
    else why.set(key, files ? 'not a picture' : 'unavailable');
  }
  return { found, why };
}

/**
 * The deck with the pictures it wants found and set, as far as they could be
 * in the time allowed. Slides whose picture was not found are left as they
 * were, still wanting it.
 */
export async function resolveDeckPictures<T extends SlideDeck>(
  deck: T,
  owner: Owner,
  deps: { fetch?: Fetch; shelf: PictureShelf; timeoutMs?: number; deadlineMs?: number; retryMs?: number }
): Promise<ResolvedPictures<T>> {
  const wanted = wantedPictures(deck).slice(0, MAX_PICTURES);
  if (!wanted.length) return { deck, ids: [], counts: { wanted: 0, filled: 0, reused: 0, empty: 0 }, empty: [] };
  const fetcher = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5_000;
  const ids = new Map<string, string>();
  const why = new Map<string, 'none' | 'not a picture' | 'unavailable'>();
  let reused = 0;

  const work = (async () => {
    const keys = wanted.map((want) => pictureKey(want.subject));
    // Kept before, for anyone: no request at all.
    const kept = await deps.shelf.findKept(keys).catch(() => []);
    await Promise.all(
      kept.map(async (row) => {
        if (ids.has(row.key)) return;
        ids.set(row.key, '');
        const copy = await deps.shelf.copy(row.id, owner).catch(() => null);
        if (copy) {
          ids.set(row.key, copy.id);
          reused += 1;
        } else ids.delete(row.key);
      })
    );
    const rest = wanted.filter((want) => !ids.get(pictureKey(want.subject)));
    if (!rest.length) return;
    const looked = await lookUp(rest, { fetcher, timeoutMs, retryMs: deps.retryMs ?? 1_200 });
    for (const [key, reason] of looked.why) why.set(key, reason);
    await Promise.all(
      [...looked.found].map(async ([key, candidate]) => {
        const bytes = await downloadPicture(candidate.imageUrl, fetcher, timeoutMs).catch(() => null);
        const contentType = bytes ? sniffPictureType(bytes) : null;
        if (!bytes || !contentType) {
          why.set(key, 'unavailable');
          return;
        }
        const size = imageDimensions(bytes);
        const row = await deps.shelf
          .create({
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
            subject: key,
          })
          .catch(() => null);
        if (row) ids.set(key, row.id);
        else why.set(key, 'unavailable');
      })
    );
  })().catch(() => undefined);

  // Whatever is in hand when the time is up is what the deck gets.
  await Promise.race([work, sleep(deps.deadlineMs ?? 9_000)]);
  const filled = new Map([...ids].filter(([, id]) => id));
  const empty = wanted
    .filter((want) => !filled.has(pictureKey(want.subject)))
    .map((want) => ({ subject: want.subject, why: why.get(pictureKey(want.subject)) ?? ('unavailable' as const) }));
  return {
    deck: withFoundPictures(deck, filled),
    ids: [...filled.values()],
    counts: { wanted: wanted.length, filled: filled.size, reused, empty: empty.length },
    empty,
  };
}

/**
 * The planner's reply with its deck's pictures found. A picture slide still
 * without its picture becomes its question. A reply with no deck, or a deck
 * that wants nothing, comes back as it was.
 */
export async function withResolvedPictures(
  reply: string,
  owner: Owner,
  deps: Parameters<typeof resolveDeckPictures>[2]
): Promise<{ reply: string; ids: string[]; counts: PictureCounts; empty: ResolvedPictures<SlideDeck>['empty'] }> {
  const nothing = { reply, ids: [], counts: { wanted: 0, filled: 0, reused: 0, empty: 0 }, empty: [] };
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return nothing;
  const resolved = await resolveDeckPictures(outcome.deck, owner, deps);
  const settled = withoutEmptyPictureSlides(resolved.deck);
  if (settled === outcome.deck) return nothing;
  return { reply: `${outcome.body.trim()}\n\n${fenceSlideDeck(settled)}`, ids: resolved.ids, counts: resolved.counts, empty: resolved.empty };
}
