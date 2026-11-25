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
  searchOpenPictures,
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
import { withNamedSubjects, withTitlePicture, type AskEditor, type PictureKit } from './picture-subjects.server';
import {
  pictureKey,
  pictureWords,
  wantedPictures,
  withFoundPictures,
  withoutEmptyPictureSlides,
  withPictureSlots,
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
/**
 * The narrowest lead picture kept. 480 until the visuals review (Nov 22):
 * portraits from before 1950 are small scans (Wilfred Owen's is 333 pixels
 * wide, Zora Neale Hurston's 408, Edwin Booth's Hamlet 361), and the rule
 * cost nearly every missing author's face. The second look still judges
 * whether a picture reads when projected.
 */
const MIN_WIDTH = 320;
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

/** The most subjects given a second try in one deck: each is a search, two downloads and a look. */
const MAX_SECOND_TRIES = 4;
const SEARCH_STOP = new Set(
  'a an and are as at by for from in into is it its of on or that the their this to was were with showing shows show such like worn used seen with portrait photograph photo picture image painting depiction scene view'.split(' ')
);

/**
 * What Commons is searched for: the subject, then the few words of "should
 * show" that say which one is meant (a year, a place, a kind), without the
 * filler. "Gas mask" + "Early World War I gas mask worn by soldiers on the
 * Western Front" → "Gas mask early World War I soldiers Western".
 */
export function searchWords(want: Pick<WantedPicture, 'subject' | 'shows' | 'find'>, most = 5): string {
  if (want.find) return want.find;
  const subject = want.subject.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const has = new Set(subject.toLowerCase().split(/[^a-z0-9]+/));
  const extra: string[] = [];
  for (const word of (want.shows ?? '').split(/[^\p{L}\p{N}'’-]+/u)) {
    const lower = word.toLowerCase();
    if (word.length < 3 || SEARCH_STOP.has(lower) || has.has(lower)) continue;
    has.add(lower);
    extra.push(word);
    if (extra.length >= most) break;
  }
  return [subject, ...extra].join(' ');
}

/**
 * What Commons is searched for, in turn, until something comes back: the
 * subject with two words of what it should show, then the subject alone.
 * Commons wants every word of a search: five words of "shows" found nothing
 * (visuals, Nov 23: four subjects tried, no picture to look at).
 */
export function searchQueries(want: Pick<WantedPicture, 'subject' | 'shows' | 'find'>): string[] {
  if (want.find) return [want.find];
  const subject = want.subject.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return [...new Set([searchWords(want, 2), subject].filter(Boolean))];
}
type Fetch = typeof fetch;

/** Where found pictures are kept: this lesson's, and any kept before for the same subject. */
export type PictureShelf = {
  /** The newest picture kept for each of these subjects, by anyone: they are open pictures. */
  findKept(keys: string[]): Promise<
    Array<{
      key: string;
      id: string;
      credit?: string;
      altText?: string;
      /** The picture itself, for the second look. */
      blob?: Uint8Array;
      contentType?: string;
    }>
  >;
  /** That picture again, as this lesson's own (with the look's alt text, when it wrote one). */
  copy(
    id: string,
    owner: Owner,
    changes?: { altText?: string }
  ): Promise<{ id: string }>;
  /** That picture drawn as a screen print, as this lesson's own; null when it can't be. */
  print?(id: string, owner: Owner): Promise<{ id: string } | null>;
  /** Off the shelf: the second look turned it down, so it is never offered for its subject again. */
  forget?(id: string): Promise<void>;
  create(
    data: Parameters<PictureStore['create']>[0] & { subject: string }
  ): Promise<{ id: string }>;
};

export type PictureCounts = {
  wanted: number;
  filled: number;
  reused: number;
  empty: number;
  /** Found on the second try, by a search of Commons the look chose from. */
  searched?: number;
  /** Subjects the second try searched for, found or not; and how many results the look was shown. */
  secondTried?: number;
  secondShown?: number;
  /** Where the second try's pictures went (visuals, Nov 23: tried 4, shown none): results, usable, downloaded, and a search that failed. */
  secondHits?: number;
  secondUsable?: number;
  secondFailed?: number;
};
export type ResolvedPictures<T> = {
  deck: T;
  ids: string[];
  counts: PictureCounts;
  empty: Array<{
    subject: string;
    why: Miss;
    /** What the look said when it turned the picture down. */
    said?: string;
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
        'LicenseShortName|Artist|Credit|ImageDescription|ObjectName|DateTimeOriginal',
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
    const candidate = record ? candidateFromFile(record, { minWidth: MIN_WIDTH }) : null;
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
  let searched = 0;
  // What the look said when it turned a picture down, for the report (rules test, Nov 23).
  const lookWhy = new Map<string, string>();
  let secondTried = 0;
  let secondShown = 0;
  let secondHits = 0;
  let secondUsable = 0;
  let secondFailed = 0;
  let lookOutcome: ResolvedPictures<T>['look'] = null;

  const work = (async () => {
    const keys = wanted.map((want) => pictureKey(want.subject));
    // Kept before, for anyone: no request at all.
    // A picture kept before is held to today's fixed rules (Night, Nov 22: a
    // disputed-copyright file and the Auschwitz ramp were on the shelf) and,
    // with the second look on, to the look like any new one (the Grapes rerun
    // reused the novel's cover for three Joads).
    const kept = (await deps.shelf.findKept(keys).catch(() => [])).filter(
      (row) =>
        !FOR_THE_TEACHER.test(
          `${row.key} ${row.altText ?? ''} ${row.credit ?? ''}`
        ) && !/copyright claims?/i.test(row.credit ?? '')
    );
    const held = new Map<string, (typeof kept)[number]>();
    await Promise.all(
      kept.map(async (row) => {
        if (ids.has(row.key) || held.has(row.key)) return;
        if (deps.look) {
          if (row.blob && /^image\/(jpeg|png)$/.test(row.contentType ?? ''))
            held.set(row.key, row);
          return;
        }
        ids.set(row.key, '');
        const copy = await deps.shelf.copy(row.id, owner).catch(() => null);
        if (copy) {
          ids.set(row.key, copy.id);
          reused += 1;
        } else ids.delete(row.key);
      })
    );
    const rest = wanted.filter(
      (want) =>
        !ids.get(pictureKey(want.subject)) &&
        !held.has(pictureKey(want.subject))
    );
    const looked = rest.length
      ? await lookUp(rest, {
          fetcher,
          timeoutMs,
          retryMs: deps.retryMs ?? 1_200,
        })
      : {
          found: new Map<string, FoundCandidate>(),
          why: new Map<string, Miss>(),
        };
    for (const [key, reason] of looked.why) why.set(key, reason);
    // Every picture downloaded first, so the second look sees them together.
    const downloaded = (
      await Promise.all(
        [...looked.found].map(async ([key, candidate]) => {
          // Never fetched, never shown to a model.
          if (
            FOR_THE_TEACHER.test(`${candidate.title} ${candidate.description}`)
          ) {
            why.set(key, 'for the teacher');
            return null;
          }
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
    const shelved = [...held.values()];
    let verdicts: {
      verdicts: Map<number, LookVerdict>;
      unchecked: number;
    } | null = null;
    if (deps.look && (downloaded.length || shelved.length)) {
      const words = pictureWords(deck);
      const asked = new Map(
        wanted.map((want) => [pictureKey(want.subject), want])
      );
      const about = (key: string) => ({
        subject: asked.get(key)?.subject ?? key,
        shows: asked.get(key)?.shows,
        words: words.get(key),
      });
      verdicts = await secondLook(
        [
          ...downloaded.flatMap((item, i) =>
            item.contentType === 'image/jpeg' ||
            item.contentType === 'image/png'
              ? [
                  {
                    n: i + 1,
                    ...about(item.key),
                    bytes: item.bytes,
                    contentType: item.contentType,
                  },
                ]
              : []
          ),
          ...shelved.map((row, i) => ({
            n: downloaded.length + i + 1,
            ...about(row.key),
            bytes: row.blob!,
            contentType: row.contentType as 'image/jpeg' | 'image/png',
          })),
        ],
        deps.look
      );
      lookOutcome = {
        seen: downloaded.length + shelved.length,
        turnedDown: [...verdicts.verdicts.values()].filter(
          (verdict) => !verdict.keep
        ).length,
        unchecked: verdicts.unchecked,
      };
    }
    // Kept before, and kept again only on the look's word. One it turns down
    // leaves the shelf, so the next deck looks its subject up afresh.
    await Promise.all(
      shelved.map(async (row, i) => {
        const verdict = verdicts?.verdicts.get(downloaded.length + i + 1);
        if (!verdict) {
          why.set(row.key, 'unchecked');
          return;
        }
        if (!verdict.keep) {
          why.set(row.key, 'not the thing');
          if (verdict.why) lookWhy.set(row.key, verdict.why);
          await deps.shelf.forget?.(row.id).catch(() => undefined);
          return;
        }
        const copy = await deps.shelf
          .copy(
            row.id,
            owner,
            verdict.alt ? { altText: cleanAltText(verdict.alt) } : undefined
          )
          .catch(() => null);
        if (copy) {
          ids.set(row.key, copy.id);
          reused += 1;
        } else why.set(row.key, 'unavailable');
      })
    );
    await Promise.all(
      downloaded.map(async ({ key, candidate, bytes, contentType }, i) => {
        const verdict = verdicts?.verdicts.get(i + 1);
        // With the second look on, only what it saw and kept is kept.
        if (deps.look && !verdict) {
          why.set(key, 'unchecked');
          return;
        }
        if (verdict && !verdict.keep) {
          why.set(key, 'not the thing');
          if (verdict.why) lookWhy.set(key, verdict.why);
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
    // A second try (visuals review, Nov 22). A general subject has a general
    // lead picture ("Gas mask": a present-day rescue team; "Tenement": a
    // modern block), and about a third of the pictures asked for were lost
    // that way. For a few of those, Wikimedia Commons is searched with what
    // the slide says the picture should show, and the second look chooses
    // among what comes back or keeps none. Never without the look: a search
    // alone is how an aircraft carrier once stood in for Garibaldi.
    // A look that answered for nothing is down: no second try without it.
    const lookIsDown = Boolean(lookOutcome && lookOutcome.seen > 0 && lookOutcome.unchecked === lookOutcome.seen);
    if (deps.look && !lookIsDown) {
      const again = wanted
        .filter((want) => {
          const key = pictureKey(want.subject);
          const reason = why.get(key);
          return !ids.get(key) && Boolean(want.shows) && (reason === 'none' || reason === 'not a picture' || reason === 'not the thing');
        })
        .slice(0, MAX_SECOND_TRIES);
      const offered: Array<{ key: string; candidate: FoundCandidate }> = [];
      for (const want of again) {
        secondTried += 1;
        let hits: FoundCandidate[] = [];
        let busy = false;
        for (const query of searchQueries(want)) {
          try {
            hits = await searchOpenPictures(query, { fetch: fetcher, limit: 5, timeoutMs });
          } catch {
            busy = true;
            break;
          }
          if (hits.length) break;
        }
        if (busy) {
          // Busy: the rest wait for another deck.
          secondFailed += 1;
          break;
        }
        secondHits += hits.length;
        const usable = hits
          .filter(
            (hit) =>
              !FOR_THE_TEACHER.test(`${hit.title} ${hit.description}`) &&
              !NOT_A_PICTURE.test(hit.title) &&
              !offered.some((other) => other.candidate.sourceUrl === hit.sourceUrl)
          )
          .slice(0, 2);
        secondUsable += usable.length;
        for (const candidate of usable) offered.push({ key: pictureKey(want.subject), candidate });
      }
      const fetched = (
        await Promise.all(
          offered.map(async ({ key, candidate }) => {
            const bytes = await downloadPicture(candidate.imageUrl, fetcher, timeoutMs).catch(() => null);
            const contentType = bytes ? sniffPictureType(bytes) : null;
            return bytes && (contentType === 'image/jpeg' || contentType === 'image/png') ? { key, candidate, bytes, contentType } : null;
          })
        )
      ).filter((item): item is NonNullable<typeof item> => Boolean(item));
      secondShown = fetched.length;
      if (fetched.length) {
        const words = pictureWords(deck);
        const asked = new Map(wanted.map((want) => [pictureKey(want.subject), want]));
        const second = await secondLook(
          fetched.map((item, i) => ({
            n: i + 1,
            subject: asked.get(item.key)?.subject ?? item.key,
            shows: asked.get(item.key)?.shows,
            words: words.get(item.key),
            bytes: item.bytes,
            contentType: item.contentType as 'image/jpeg' | 'image/png',
          })),
          deps.look
        );
        const seenBefore = lookOutcome ?? { seen: 0, turnedDown: 0, unchecked: 0 };
        lookOutcome = {
          seen: seenBefore.seen + fetched.length,
          turnedDown: seenBefore.turnedDown + [...second.verdicts.values()].filter((verdict) => !verdict.keep).length,
          unchecked: seenBefore.unchecked + second.unchecked,
        };
        for (const [i, item] of fetched.entries()) {
          const verdict = second.verdicts.get(i + 1);
          if (verdict && !verdict.keep && verdict.why && !ids.get(item.key)) lookWhy.set(item.key, `second try: ${verdict.why}`);
          // The first one kept for a subject is the one.
          if (!verdict?.keep || ids.get(item.key)) continue;
          const size = imageDimensions(item.bytes);
          const row = await deps.shelf
            .create({
              membershipId: owner.membershipId,
              conversationId: owner.conversationId,
              position: 0,
              slideNumbers: [],
              altText: cleanAltText(verdict.alt || item.candidate.description),
              contentType: item.contentType,
              byteSize: item.bytes.byteLength,
              width: size?.width ?? null,
              height: size?.height ?? null,
              blob: item.bytes,
              origin: 'found',
              credit: item.candidate.credit,
              license: item.candidate.license,
              sourceUrl: item.candidate.sourceUrl,
              subject: item.key,
            })
            .catch(() => null);
          if (row) {
            ids.set(item.key, row.id);
            why.delete(item.key);
            searched += 1;
          }
        }
      }
    }
  })().catch(() => undefined);

  // Whatever is in hand when the time is up is what the deck gets.
  await Promise.race([work, sleep(deps.deadlineMs ?? 9_000)]);
  const filled = new Map([...ids].filter(([, id]) => id));
  const empty = wanted
    .filter((want) => !filled.has(pictureKey(want.subject)))
    .map((want) => ({
      subject: want.subject,
      why: why.get(pictureKey(want.subject)) ?? ('unavailable' as const),
      ...(lookWhy.get(pictureKey(want.subject)) ? { said: lookWhy.get(pictureKey(want.subject))!.slice(0, 120) } : {}),
    }));
  return {
    deck: withFoundPictures(deck, filled),
    ids: [...filled.values()],
    counts: {
      wanted: wanted.length,
      filled: filled.size,
      reused,
      empty: empty.length,
      ...(searched ? { searched } : {}),
      ...(secondTried ? { secondTried, secondShown, secondHits, secondUsable, ...(secondFailed ? { secondFailed } : {}) } : {}),
    },
    empty,
    look: lookOutcome,
  };
}

/**
 * The title slide's world as a screen print (Kevin, Nov 25): when the title
 * asked for its world to be printed and a picture was found, the print takes
 * its place and the slide is laid out as a poster. A photo that can't be
 * printed (too small, not a JPEG) stays as it is, on the ordinary title.
 */
export async function withPosterTitle<T extends SlideDeck>(asked: SlideDeck, deck: T, owner: Owner, shelf: PictureShelf): Promise<T> {
  const at = deck.slides.findIndex((slide) => slide.layout === 'title');
  const title = deck.slides[at];
  if (at < 0 || !title?.image || title.poster || !asked.slides[at]?.wants?.print || !shelf.print) return deck;
  const printed = await shelf.print(title.image, owner).catch(() => null);
  if (!printed) return deck;
  return { ...deck, slides: deck.slides.map((slide, i) => (i === at ? { ...slide, image: printed.id, poster: true } : slide)) };
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
    /** The work's vetted pictures, when the lesson is on one of the most-taught works. */
    kit?: PictureKit | null;
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
    ? await withNamedSubjects(outcome.deck, deps.name, deps.kit)
    : { deck: outcome.deck, named: 0, author: null, world: null };
  const titled = withTitlePicture(edited.deck, { kit: deps.kit, author: edited.author, world: edited.world ?? null });
  const resolved = await resolveDeckPictures(titled, owner, deps);
  let settled = withoutEmptyPictureSlides(await withPosterTitle(titled, resolved.deck, owner, deps.shelf));
  // The gallery painting is a mood, not the thing: Kevin on the Leopard deck,
  // and the 13-lesson review (Nov 22: Hokusai's Great Wave on Homer, Gatsby
  // and Hamlet; Turner's Temeraire on a World War I poem). It stays only
  // when a look slide studies it.
  if (
    settled.art &&
    !settled.slides.some((slide) => slide.layout === 'look' && !slide.image)
  )
    settled = { ...settled, art: undefined };
  // What was asked for and not found is a labeled slot for the teacher (R10).
  settled = withPictureSlots(settled);
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
