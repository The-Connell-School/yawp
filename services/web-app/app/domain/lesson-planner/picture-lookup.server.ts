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
import {
  imageDimensions,
  sniffPictureType,
} from '~/domain/office/image-dimensions';
import { cleanAltText } from '~/domain/office/pptx-pictures';
import {
  candidateFromFile,
  downloadPicture,
  wikimediaHeaders,
  type CommonsPage,
  type FoundCandidate,
  type PictureStore,
} from './found-pictures.server';
import {
  secondLook,
  type LookAt,
  type LookVerdict,
} from './picture-check.server';
import { withNamedSubjects, type AskEditor } from './picture-subjects.server';
import {
  pictureKey,
  pictureWords,
  wantedPictures,
  withFoundPictures,
  withoutEmptyPictureSlides,
  type WantedPicture,
} from './picture-wants';
import {
  CONTEXT_SLIDE_LAYOUTS,
  fenceSlideDeck,
  readSlideDeck,
  type SlideDeck,
} from './slide-deck';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
/** A deck's pictures are a dozen at most: enough for every teaching slide, and one request. */
const MAX_PICTURES = 12;
const MIN_WIDTH = 480;
/** A lead "image" that is not a picture of the thing: a map of where it is, a flag, a logo, a chart. */
const NOT_A_PICTURE =
  /\.svg$|(^|[\s_\-(])(map|maps|locator|location|flag|logo|seal|icon|diagram|chart|coat[\s_]of[\s_]arms|incorporated[\s_]and[\s_]unincorporated)([\s_\-).]|$)/i;

/** Wikipedia's own one-line description of an article says when it is a place people live. */
const A_PLACE =
  /\b(city|town|village|hamlet|suburb|borough|township|municipality|commune|community|settlement|census-designated place|neighbou?rhood|district|county|capital)\b/i;

/**
 * A town's lead picture is often some landmark in it (for Levittown,
 * Pennsylvania, a colonial house: live run, Nov 22). It is kept only when the
 * file is named for the town, as a skyline or a street of it is.
 */
/** An article about a made thing (Wikipedia's short description: "1932 film by Victor Fleming"). */
const A_WORK =
  /\b(film|movie|album|song|single|novel|novella|book|poem|play|musical|opera|band|television|TV series|sitcom|video game|episode|painting|sculpture)\b/i;

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
  create(
    data: Parameters<PictureStore['create']>[0] & { subject: string }
  ): Promise<{ id: string }>;
};

export type PictureCounts = {
  wanted: number;
  filled: number;
  reused: number;
  empty: number;
};
export type ResolvedPictures<T> = {
  deck: T;
  ids: string[];
  counts: PictureCounts;
  empty: Array<{
    subject: string;
    why: Miss;
  }>;
  /** The second look: pictures sent to it, turned down, and not answered for (none of those is kept). Null when there was none. */
  look: { seen: number; turnedDown: number; unchecked: number } | null;
};

/**
 * Why a subject has no picture. `for the teacher`: a picture of mass death or
 * cruelty, never placed automatically. `unchecked`: the second look did not
 * answer for it, so it is not kept.
 */
type Miss =
  | 'none'
  | 'not a picture'
  | 'unavailable'
  | 'not the thing'
  | 'for the teacher'
  | 'unchecked';

/**
 * Pictures that are only ever a teacher's choice: the Holocaust and other
 * genocides, massacres, lynchings, the dead. Checked on the article, its
 * description and the file, before any model sees it (Night, Nov 22: the
 * Auschwitz selection ramp reached a slide when the second look ran out of
 * time).
 */
const FOR_THE_TEACHER =
  /\b(holocaust|shoah|auschwitz|birkenau|treblinka|sobibor|majdanek|dachau|buchenwald|bergen[-\s_]?belsen|concentration[\s_]camps?|extermination|death[\s_]camps?|death[\s_]march|genocide|massacre|lynch(ed|ing|ings)?|pogrom|atrocit(y|ies)|corpses?|mass[\s_]graves?|execution[\s_]of)\b/i;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function ask(
  params: Record<string, string>,
  fetcher: Fetch,
  timeoutMs: number,
  retryMs: number
): Promise<any | null> {
  const url = `${WIKIPEDIA_API}?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: wikimediaHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
      });
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

const fileKey = (name: string) =>
  name
    .replace(/^File:/i, '')
    .replace(/_/g, ' ')
    .trim();

/** Each subject's lead picture on Wikipedia, as a picture a school may show. */
async function lookUp(
  wanted: WantedPicture[],
  {
    fetcher,
    timeoutMs,
    retryMs,
  }: { fetcher: Fetch; timeoutMs: number; retryMs: number }
): Promise<{
  found: Map<string, FoundCandidate>;
  why: Map<string, Miss>;
}> {
  const found = new Map<string, FoundCandidate>();
  const why = new Map<string, Miss>();
  // A subject named by a phrase ("The Rosenbergs executed 1953"), not a title:
  // Wikipedia's search names the article. One at a time, as Wikipedia asks of
  // its clients (a burst is what gets an address refused).
  const titled = new Map<string, string>();
  let refused = false;
  for (const want of wanted.filter((want) => want.find)) {
    // Refused once: the rest wait for another deck, and the named subjects still get their turn.
    const hits: { query?: { search?: Array<{ title?: string }> } } | null =
      refused
        ? null
        : await ask(
            { list: 'search', srsearch: want.find!, srlimit: '1', srprop: '' },
            fetcher,
            timeoutMs,
            retryMs
          );
    refused ||= !hits;
    const title = hits?.query?.search?.[0]?.title;
    if (typeof title === 'string' && title.trim())
      titled.set(pictureKey(want.subject), title);
    else why.set(pictureKey(want.subject), hits ? 'none' : 'unavailable');
  }
  const titleOf = (want: WantedPicture) =>
    want.find ? titled.get(pictureKey(want.subject)) : want.subject;
  const asking = wanted.filter((want) => titleOf(want));
  if (!asking.length) return { found, why };
  const pages = await ask(
    {
      redirects: '1',
      titles: [...new Set(asking.map((want) => titleOf(want)!))].join('|'),
      prop: 'pageimages|description',
      piprop: 'thumbnail|name',
      pithumbsize: '1280',
      pilicense: 'free',
    },
    fetcher,
    timeoutMs,
    retryMs
  );
  if (!pages?.query?.pages) {
    for (const want of asking) why.set(pictureKey(want.subject), 'unavailable');
    return { found, why };
  }
  // A subject as written, to the article it is: through Wikipedia's own spelling and its redirects.
  const hops = new Map<string, string>();
  for (const hop of [
    ...(pages.query.normalized ?? []),
    ...(pages.query.redirects ?? []),
  ] as Array<{ from: string; to: string }>)
    hops.set(pictureKey(hop.from), hop.to);
  const articleOf = (subject: string) => {
    let title = subject;
    for (let i = 0; i < 4 && hops.has(pictureKey(title)); i += 1)
      title = hops.get(pictureKey(title))!;
    return pictureKey(title);
  };
  const leads = new Map<
    string,
    {
      file: string;
      width: number;
      fits: boolean;
      title: string;
      work: boolean;
      grave: boolean;
      fictional: boolean;
    }
  >();
  for (const page of Object.values(pages.query.pages) as Array<{
    title?: string;
    description?: string;
    pageimage?: string;
    thumbnail?: { width?: number };
  }>) {
    if (!page.title || !page.pageimage) continue;
    const fits =
      !A_PLACE.test(page.description ?? '') ||
      namedFor(page.pageimage, page.title);
    leads.set(pictureKey(page.title), {
      file: page.pageimage,
      width: page.thumbnail?.width ?? 0,
      fits,
      title: page.title,
      work: A_WORK.test(page.description ?? ''),
      grave: FOR_THE_TEACHER.test(
        `${page.title} ${page.description ?? ''} ${page.pageimage}`
      ),
      fictional: /\b(fictional|character)\b/i.test(page.description ?? ''),
    });
  }
  const fileFor = new Map<string, string>();
  for (const want of asking) {
    const key = pictureKey(want.subject);
    const lead = leads.get(articleOf(titleOf(want)!));
    if (!lead) why.set(key, 'none');
    else if (lead.grave) why.set(key, 'for the teacher');
    else if (
      NOT_A_PICTURE.test(lead.file) ||
      lead.width < MIN_WIDTH ||
      !lead.fits
    )
      why.set(key, 'not a picture');
    // A search can land on a film of the same words ("First dust storms 1932"
    // found Red Dust, a 1932 film): a work is kept only when the event names it.
    else if (
      want.find &&
      lead.work &&
      !pictureKey(want.subject).includes(
        pictureKey(lead.title.replace(/\s*\([^)]*\)\s*$/, ''))
      )
    )
      why.set(key, 'none');
    // A person Yawp! asked for on its own is only their own article: on the
    // preview (Nov 22) Tom Joad led to the novel's cover and Rose of Sharon
    // to a hibiscus. A character in a novel has no photograph.
    else if (
      want.own &&
      (lead.fictional ||
        lead.work ||
        !pictureKey(lead.title).includes(pictureKey(want.subject)))
    )
      why.set(key, 'none');
    // One file, one subject: what Yawp! asked for on its own never repeats a
    // picture already on the way (three Joads, one book cover).
    else if (
      (want.own || want.find) &&
      [...fileFor.values()].includes(lead.file)
    )
      why.set(key, 'none');
    else fileFor.set(key, lead.file);
  }
  if (!fileFor.size) return { found, why };

  const files = await ask(
    {
      titles: [...new Set(fileFor.values())]
        .map((file) => `File:${file}`)
        .join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1280',
      iiextmetadatafilter:
        'LicenseShortName|Artist|Credit|ImageDescription|ObjectName',
    },
    fetcher,
    timeoutMs,
    retryMs
  );
  const records = new Map<string, CommonsPage>();
  for (const page of Object.values(files?.query?.pages ?? {}) as CommonsPage[])
    if (page.title) records.set(fileKey(page.title), page);
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
  deps: {
    fetch?: Fetch;
    shelf: PictureShelf;
    timeoutMs?: number;
    deadlineMs?: number;
    retryMs?: number;
    /** The second look at each new picture before it is kept. */
    look?: LookAt;
  }
): Promise<ResolvedPictures<T>> {
  const wanted = wantedPictures(deck).slice(0, MAX_PICTURES);
  if (!wanted.length)
    return {
      deck,
      ids: [],
      counts: { wanted: 0, filled: 0, reused: 0, empty: 0 },
      empty: [],
      look: null,
    };
  const fetcher = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5_000;
  const ids = new Map<string, string>();
  const why = new Map<string, Miss>();
  let reused = 0;
  let lookOutcome: ResolvedPictures<T>['look'] = null;

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
    const looked = await lookUp(rest, {
      fetcher,
      timeoutMs,
      retryMs: deps.retryMs ?? 1_200,
    });
    for (const [key, reason] of looked.why) why.set(key, reason);
    // Every picture downloaded first, so the second look sees them together.
    const downloaded = (
      await Promise.all(
        [...looked.found].map(async ([key, candidate]) => {
          const bytes = await downloadPicture(
            candidate.imageUrl,
            fetcher,
            timeoutMs
          ).catch(() => null);
          const contentType = bytes ? sniffPictureType(bytes) : null;
          if (!bytes || !contentType) {
            why.set(key, 'unavailable');
            return null;
          }
          return { key, candidate, bytes, contentType };
        })
      )
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));
    let verdicts: {
      verdicts: Map<number, LookVerdict>;
      unchecked: number;
    } | null = null;
    if (deps.look && downloaded.length) {
      const words = pictureWords(deck);
      const asked = new Map(
        wanted.map((want) => [pictureKey(want.subject), want])
      );
      verdicts = await secondLook(
        downloaded.flatMap((item, i) =>
          item.contentType === 'image/jpeg' || item.contentType === 'image/png'
            ? [
                {
                  n: i + 1,
                  subject: asked.get(item.key)?.subject ?? item.key,
                  shows: asked.get(item.key)?.shows,
                  words: words.get(item.key),
                  bytes: item.bytes,
                  contentType: item.contentType,
                },
              ]
            : []
        ),
        deps.look
      );
      lookOutcome = {
        seen: downloaded.length,
        turnedDown: [...verdicts.verdicts.values()].filter(
          (verdict) => !verdict.keep
        ).length,
        unchecked: verdicts.unchecked,
      };
    }
    await Promise.all(
      downloaded.map(async ({ key, candidate, bytes, contentType }, i) => {
        if (
          FOR_THE_TEACHER.test(`${candidate.title} ${candidate.description}`)
        ) {
          why.set(key, 'for the teacher');
          return;
        }
        const verdict = verdicts?.verdicts.get(i + 1);
        // With the second look on, only what it saw and kept is kept.
        if (deps.look && !verdict) {
          why.set(key, 'unchecked');
          return;
        }
        if (verdict && !verdict.keep) {
          why.set(key, 'not the thing');
          return;
        }
        const size = imageDimensions(bytes);
        const row = await deps.shelf
          .create({
            membershipId: owner.membershipId,
            conversationId: owner.conversationId,
            position: 0,
            slideNumbers: [],
            altText: cleanAltText(verdict?.alt || candidate.description),
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
    .map((want) => ({
      subject: want.subject,
      why: why.get(pictureKey(want.subject)) ?? ('unavailable' as const),
    }));
  return {
    deck: withFoundPictures(deck, filled),
    ids: [...filled.values()],
    counts: {
      wanted: wanted.length,
      filled: filled.size,
      reused,
      empty: empty.length,
    },
    empty,
    look: lookOutcome,
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
  deps: Parameters<typeof resolveDeckPictures>[2] & {
    /** The picture editor: names a subject for each teaching slide that asks for none. */
    name?: AskEditor;
  }
): Promise<{
  reply: string;
  ids: string[];
  counts: PictureCounts;
  empty: ResolvedPictures<SlideDeck>['empty'];
  /** Subjects the picture editor named. */
  named: number;
  look: ResolvedPictures<SlideDeck>['look'];
}> {
  const nothing = {
    reply,
    ids: [],
    counts: { wanted: 0, filled: 0, reused: 0, empty: 0 },
    empty: [],
    named: 0,
    look: null,
  };
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return nothing;
  const edited = deps.name
    ? await withNamedSubjects(outcome.deck, deps.name)
    : { deck: outcome.deck, named: 0 };
  const resolved = await resolveDeckPictures(edited.deck, owner, deps);
  let settled = withoutEmptyPictureSlides(resolved.deck);
  // A day about a text's world shows that world: the gallery painting's strip
  // is a mood, not the thing (Kevin on the Leopard deck; the Howl deck, Nov 22).
  if (
    settled.art &&
    settled.slides.some((slide) =>
      CONTEXT_SLIDE_LAYOUTS.includes(slide.layout as never)
    )
  )
    settled = { ...settled, art: undefined };
  if (settled === outcome.deck) return nothing;
  return {
    reply: `${outcome.body.trim()}\n\n${fenceSlideDeck(settled)}`,
    ids: resolved.ids,
    counts: resolved.counts,
    empty: resolved.empty,
    named: edited.named,
    look: resolved.look,
  };
}
