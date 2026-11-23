/**
 * Finding the pictures a deck wants (Kevin, Nov 22: dual coding). By subject,
 * not by search: the lead picture of the subject's Wikipedia article, free
 * licenses only, with the credit read from the file's own record. Two requests
 * for a whole deck, then the downloads together, inside a hard time limit.
 * Shapes below are Wikipedia's own, as returned on Nov 22.
 */
import { describe, expect, test } from 'bun:test';
import {
  resolveDeckPictures,
  searchWords,
  searchQueries,
  type PictureShelf,
} from './picture-lookup.server';
import type { Slide, SlideDeck } from './slide-deck';

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZYAQAZ/gH+Z3ZzW4AAAAASUVORK5CYII=',
    'base64'
  )
);

const PAGES = {
  query: {
    redirects: [
      { from: 'Risorgimento', to: 'Unification of Italy' },
      { from: 'Ma Joad', to: 'The Grapes of Wrath' },
      { from: 'Rose of Sharon', to: 'Hibiscus syriacus' },
    ],
    normalized: [{ from: 'allen ginsberg', to: 'Allen ginsberg' }],
    pages: {
      '1': { title: 'Brown v. Board of Education' },
      '2': {
        title: 'Giuseppe Garibaldi',
        pageimage: 'Garibaldi_(1866).jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Garibaldi.jpg',
          width: 1280,
          height: 1568,
        },
      },
      '3': {
        title: 'Levittown, New York',
        pageimage:
          'Nassau_County_New_York_incorporated_and_unincorporated_areas_Levittown_highlighted.svg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Levittown.svg.png',
          width: 1280,
          height: 878,
        },
      },
      '4': {
        title: 'Unification of Italy',
        pageimage: 'Episodio_delle_cinque_giornate.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Episodio.jpg',
          width: 1280,
          height: 1827,
        },
      },
      '5': {
        title: 'Mary Shelley',
        pageimage: 'Mary_Wollstonecraft_Shelley_Rothwell.tif',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Shelley.tif.jpg',
          width: 1280,
          height: 1558,
        },
      },
      '6': {
        title: 'Allen ginsberg',
        pageimage: 'Allen_Ginsberg_1979.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Ginsberg.jpg',
          width: 1280,
          height: 1707,
        },
      },
      '8': {
        title: 'Levittown, Pennsylvania',
        description: 'Unincorporated community in Pennsylvania, US',
        pageimage: 'BristolPA_PhineasPembertonHouse.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Pemberton.jpg',
          width: 1280,
          height: 850,
        },
      },
      '9': {
        title: 'Palermo',
        description: 'City in Sicily, Italy',
        pageimage: 'Sicilia_Palermo5_tango7174.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Palermo.jpg',
          width: 1280,
          height: 900,
        },
      },
      '15': {
        title: 'The Holocaust',
        description: 'Genocide of European Jews during World War II',
        pageimage:
          'Selection_on_the_ramp_at_Auschwitz-Birkenau,_1944_(Auschwitz_Album)_1a.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Ramp.jpg',
          width: 1280,
          height: 900,
        },
      },
      '16': {
        title: 'Hungary in World War II',
        description: 'History of Hungary from 1939 to 1945',
        pageimage: 'Hungary_1944_photo.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Hungary.jpg',
          width: 1280,
          height: 900,
        },
      },
      '10': {
        title: 'Julius and Ethel Rosenberg',
        pageimage: 'Julius_and_Ethel_Rosenberg_NYWTS.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Rosenberg.jpg',
          width: 1280,
          height: 900,
        },
      },
      '11': {
        title: 'Red Dust (1932 film)',
        description: '1932 film by Victor Fleming',
        pageimage: 'Red-Dust-1932-film-poster.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/RedDust.jpg',
          width: 1280,
          height: 1900,
        },
      },
      '12': {
        title: 'The Grapes of Wrath',
        description: '1939 novel by John Steinbeck',
        pageimage: 'The_Grapes_of_Wrath_(1939_1st_ed_cover).jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Grapes.jpg',
          width: 1280,
          height: 1900,
        },
      },
      '13': {
        title: 'Tom Joad',
        description: 'Fictional character in The Grapes of Wrath',
        pageimage: 'The_Grapes_of_Wrath_(1939_1st_ed_cover).jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Grapes.jpg',
          width: 1280,
          height: 1900,
        },
      },
      '14': {
        title: 'Hibiscus syriacus',
        description: 'Species of flowering plant',
        pageimage: 'Hibiscus_syriacus_flower.jpg',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Hibiscus.jpg',
          width: 1280,
          height: 900,
        },
      },
      '7': {
        title: 'Jack Kerouac',
        pageimage: 'Kerouac_by_Palumbo.png',
        thumbnail: {
          source: 'https://thumb.wikimedia.org/a/Kerouac.png',
          width: 388,
          height: 518,
        },
      },
    },
  },
};
const info = (
  file: string,
  license: string,
  artist: string,
  mime = 'image/jpeg'
) => ({
  title: `File:${file.replace(/_/g, ' ')}`,
  imageinfo: [
    {
      mime,
      thumburl: `https://thumb.wikimedia.org/thumb/${file}/1280px-${file}${mime === 'image/tiff' ? '.jpg' : ''}`,
      thumbwidth: 1280,
      thumbheight: 1500,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${file}`,
      extmetadata: {
        LicenseShortName: { value: license },
        Artist: { value: artist },
        ImageDescription: { value: `<p>${file}</p>` },
        ObjectName: { value: file.replace(/\.\w+$/, '').replace(/_/g, ' ') },
      },
    },
  ],
});
const FILES = {
  query: {
    pages: {
      a: info('Garibaldi_(1866).jpg', 'Public domain', 'Unknown author'),
      b: info(
        'Episodio_delle_cinque_giornate.jpg',
        'Public domain',
        'Baldassare Verazzi'
      ),
      c: info(
        'Mary_Wollstonecraft_Shelley_Rothwell.tif',
        'Public domain',
        'Richard Rothwell',
        'image/tiff'
      ),
      d: info('Allen_Ginsberg_1979.jpg', 'CC BY-SA 3.0', 'Hans van Dijk'),
      e: info(
        'BristolPA_PhineasPembertonHouse.jpg',
        'CC BY-SA 4.0',
        'Magicpiano'
      ),
      f: info('Sicilia_Palermo5_tango7174.jpg', 'CC BY-SA 3.0', 'Tango7174'),
      h: info(
        'Red-Dust-1932-film-poster.jpg',
        'Public domain',
        'Metro-Goldwyn-Mayer'
      ),
      i: info(
        'The_Grapes_of_Wrath_(1939_1st_ed_cover).jpg',
        'Public domain',
        'Elmer Hader'
      ),
      k: {
        ...info('Hungary_1944_photo.jpg', 'Public domain', 'Bernhard Walter'),
        imageinfo: [
          {
            ...info(
              'Hungary_1944_photo.jpg',
              'Public domain',
              'Bernhard Walter'
            ).imageinfo[0],
            extmetadata: {
              LicenseShortName: { value: 'Public domain' },
              Artist: { value: 'Bernhard Walter' },
              ImageDescription: {
                value:
                  'Selection of Hungarian Jews on the ramp at Auschwitz-Birkenau, May 1944',
              },
              ObjectName: { value: 'Hungarian Jews, 1944' },
            },
          },
        ],
      },
      g: info(
        'Julius_and_Ethel_Rosenberg_NYWTS.jpg',
        'Public domain',
        'Roger Higgins, World-Telegram staff photographer'
      ),
    },
  },
};

function wikipedia(overrides: { pagesStatus?: number; hang?: RegExp } = {}) {
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    if (overrides.hang?.test(href))
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted'))
        )
      );
    expect(new Headers(init?.headers).get('user-agent')).toContain(
      'support@yawp.school'
    );
    if (href.includes('list=search')) {
      const asked = new URL(href).searchParams.get('srsearch') ?? '';
      const title = /Rosenberg/.test(asked)
        ? 'Julius and Ethel Rosenberg'
        : /dust storms/.test(asked)
          ? 'Red Dust (1932 film)'
          : /Grapes/.test(asked)
            ? 'The Grapes of Wrath'
            : null;
      return new Response(
        JSON.stringify({ query: { search: title ? [{ ns: 0, title }] : [] } }),
        { status: 200 }
      );
    }
    if (href.includes('prop=pageimages'))
      return new Response(JSON.stringify(PAGES), {
        status: overrides.pagesStatus ?? 200,
      });
    if (href.includes('prop=imageinfo'))
      return new Response(JSON.stringify(FILES), { status: 200 });
    return new Response(PNG, { status: 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

function shelf(
  kept: Array<{
    key: string;
    id: string;
    credit?: string;
    altText?: string;
  }> = []
): PictureShelf & {
  created: Array<Record<string, unknown>>;
  copied: string[];
  changes: Array<{ altText?: string } | undefined>;
  forgotten: string[];
} {
  const created: Array<Record<string, unknown>> = [];
  const copied: string[] = [];
  const changes: Array<{ altText?: string } | undefined> = [];
  const forgotten: string[] = [];
  return {
    created,
    copied,
    changes,
    forgotten,
    async findKept(keys) {
      // Every kept picture has its bytes, as the database row does.
      return kept
        .filter((row) => keys.includes(row.key))
        .map((row) => ({ ...row, blob: PNG, contentType: 'image/png' }));
    },
    async copy(id, _owner, change) {
      copied.push(id);
      changes.push(change);
      return { id: `ckcopy${id.slice(-7)}` };
    },
    async forget(id) {
      forgotten.push(id);
    },
    async create(data) {
      created.push(data);
      return { id: `ckfound${String(created.length).padStart(6, '0')}` };
    },
  };
}

const want = (subject: string, shows?: string) => ({
  subject,
  ...(shows ? { shows } : {}),
});
const DECK: SlideDeck = {
  title: 'Italy and after',
  slides: [
    {
      layout: 'big_idea',
      title: 'Garibaldi',
      body: 'One general, a thousand volunteers.',
      wants: want('Giuseppe Garibaldi'),
      speakerNotes: 'n',
    },
    {
      layout: 'notes',
      title: 'Levittown',
      facts: ['17,000 houses.'],
      wants: want('Levittown, New York', 'from the air'),
      speakerNotes: 'n',
    },
    {
      layout: 'notes',
      title: 'The Risorgimento',
      facts: ['1815 to 1871.'],
      wants: want('Risorgimento'),
      speakerNotes: 'n',
    },
    {
      layout: 'timeline',
      title: 'Two centuries',
      events: [
        { date: '1818', title: 'Frankenstein', wants: want('Mary Shelley') },
        {
          date: '1954',
          title: 'Brown v. Board',
          wants: want('Brown v. Board of Education'),
        },
        { date: '1956', title: 'Howl', wants: want('allen ginsberg') },
        { date: '1957', title: 'On the Road', wants: want('Jack Kerouac') },
      ],
      speakerNotes: 'n',
    },
  ] as Slide[],
};
const owner = { membershipId: 'm1', conversationId: null };

describe('resolveDeckPictures', () => {
  test('two requests for the whole deck, and each subject’s own picture on the slide that asked', async () => {
    const { fetcher, calls } = wikipedia();
    const db = shelf();
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: fetcher,
      shelf: db,
    });
    const api = calls.filter((url) => url.includes('/w/api.php'));
    expect(api.length).toBe(2);
    expect(api[0]).toContain('en.wikipedia.org');
    expect(api[0]).toContain('pilicense=free');
    expect(result.deck.slides[0]!.image).toBe('ckfound000001');
    // Followed through a redirect (Risorgimento is "Unification of Italy") and a lower-case name.
    expect(result.deck.slides[2]!.image).toBeTruthy();
    expect(result.deck.slides[3]!.events![2]!.image).toBeTruthy();
    // A TIFF original is kept from its JPEG rendering.
    expect(result.deck.slides[3]!.events![0]!.image).toBeTruthy();
    expect(db.created[0]).toMatchObject({
      subject: 'giuseppe garibaldi',
      origin: 'found',
      license: 'Public domain',
      credit: 'Garibaldi (1866), Public domain, via Wikimedia Commons',
      membershipId: 'm1',
    });
    expect(
      db.created.find((row) => row.subject === 'allen ginsberg')
    ).toMatchObject({
      license: 'CC BY-SA 3.0',
      credit:
        'Hans van Dijk, Allen Ginsberg 1979, CC BY-SA 3.0, via Wikimedia Commons',
    });
  });

  test('no picture is better than a wrong one: a map of the county, a tiny file and a subject with none are left empty', async () => {
    const { fetcher } = wikipedia();
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: fetcher,
      shelf: shelf(),
    });
    expect(result.deck.slides[1]!.image).toBeUndefined();
    expect(result.deck.slides[3]!.events![1]!.image).toBeUndefined();
    expect(result.deck.slides[3]!.events![3]!.image).toBeUndefined();
    expect(result.counts).toEqual({
      wanted: 7,
      filled: 4,
      reused: 0,
      empty: 3,
    });
    expect(result.empty.map((miss) => miss.subject).sort()).toEqual([
      'Brown v. Board of Education',
      'Jack Kerouac',
      'Levittown, New York',
    ]);
  });

  test('a town’s lead picture is often some landmark in it: kept only when the file is named for the town (live run, Nov 22)', async () => {
    const towns = {
      title: 'Places',
      slides: [
        {
          layout: 'notes',
          title: 'Levittown',
          facts: ['Identical houses.'],
          wants: want(
            'Levittown, Pennsylvania',
            'the rows of identical houses'
          ),
          speakerNotes: 'n',
        },
        {
          layout: 'notes',
          title: 'Palermo',
          facts: ['Sicily’s capital.'],
          wants: want('Palermo'),
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(towns, owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    // The Phineas Pemberton House is in Levittown, Pennsylvania; it is not a picture of Levittown.
    expect(result.deck.slides[0]!.image).toBeUndefined();
    expect(result.empty).toEqual([
      { subject: 'Levittown, Pennsylvania', why: 'not a picture' },
    ]);
    expect(result.deck.slides[1]!.image).toBeTruthy();
  });

  test('a picture already kept for a subject is reused without asking Wikipedia for it', async () => {
    const { fetcher, calls } = wikipedia();
    const db = shelf([{ key: 'giuseppe garibaldi', id: 'ckkept0000001' }]);
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: fetcher,
      shelf: db,
    });
    expect(db.copied).toEqual(['ckkept0000001']);
    expect(result.deck.slides[0]!.image).toBe('ckcopy0000001');
    expect(
      decodeURIComponent(
        calls.find((url) => url.includes('prop=pageimages'))!
      ).replace(/\+/g, ' ')
    ).not.toContain('Giuseppe Garibaldi');
    expect(result.counts.reused).toBe(1);
  });

  test('a deck that wants nothing asks nothing', async () => {
    const { fetcher, calls } = wikipedia();
    const plain = {
      title: 'x',
      slides: [{ layout: 'title', title: 'x', speakerNotes: 'n' }] as Slide[],
    };
    const result = await resolveDeckPictures(plain, owner, {
      fetch: fetcher,
      shelf: shelf(),
    });
    expect(result.deck).toBe(plain);
    expect(calls).toEqual([]);
  });

  test('Wikipedia busy or silent: the deck comes back as it was, in time', async () => {
    const busy = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia({ pagesStatus: 429 }).fetcher,
      shelf: shelf(),
      retryMs: 10,
    });
    expect(busy.deck.slides[0]!.image).toBeUndefined();
    expect(busy.counts.filled).toBe(0);
    const started = Date.now();
    const silent = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia({ hang: /api\.php/ }).fetcher,
      shelf: shelf(),
      timeoutMs: 150,
      deadlineMs: 400,
    });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(silent.counts.filled).toBe(0);
  });

  test('one slow download never costs the others their pictures', async () => {
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia({ hang: /thumb\.wikimedia.*Garibaldi/ }).fetcher,
      shelf: shelf(),
      timeoutMs: 150,
      deadlineMs: 2000,
    });
    expect(result.deck.slides[0]!.image).toBeUndefined();
    expect(result.deck.slides[2]!.image).toBeTruthy();
  });

  test('never more than a dozen pictures for one deck', async () => {
    const many = {
      title: 'x',
      slides: Array.from({ length: 20 }, (_, i) => ({
        layout: 'big_idea',
        title: `T${i}`,
        body: 'b',
        wants: want(`Subject ${i}`),
        speakerNotes: 'n',
      })) as Slide[],
    };
    const { fetcher, calls } = wikipedia();
    await resolveDeckPictures(many, owner, { fetch: fetcher, shelf: shelf() });
    const asked = decodeURIComponent(
      calls.find((url) => url.includes('prop=pageimages'))!
    ).replace(/\+/g, ' ');
    expect(asked).toContain('Subject 11');
    expect(asked).not.toContain('Subject 12');
  });
});

describe('what the planner did not ask for (live preview, Nov 22)', () => {
  test('an event is found by searching its title and date; a person by their name', async () => {
    const { fetcher, calls } = wikipedia();
    const deck = {
      title: 'The 1950s',
      slides: [
        {
          layout: 'timeline',
          title: 'Fear',
          events: [
            { date: '1953', title: 'The Rosenbergs executed' },
            { date: '1955', title: 'Nothing like it' },
          ],
          speakerNotes: 'n',
        },
        {
          layout: 'person',
          title: 'The Beats',
          people: [
            { name: 'Giuseppe Garibaldi', role: 'General' },
            { name: 'Jack Kerouac', role: 'Novelist' },
          ],
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(deck, owner, {
      fetch: fetcher,
      shelf: shelf(),
    });
    expect(calls.filter((url) => url.includes('list=search')).length).toBe(2);
    expect(
      decodeURIComponent(
        calls.find((url) => url.includes('prop=pageimages'))!
      ).replace(/\+/g, ' ')
    ).toContain('Julius and Ethel Rosenberg');
    expect(result.deck.slides[0]!.events![0]!.image).toBeTruthy();
    expect(result.deck.slides[0]!.events![1]!.image).toBeUndefined();
    expect(result.deck.slides[1]!.people![0]!.image).toBeTruthy();
    expect(result.empty).toEqual([
      { subject: 'Nothing like it', why: 'none' },
      { subject: 'Jack Kerouac', why: 'not a picture' },
    ]);
  });

  test('a search that lands on a film of the same words is no picture of the event; a work the event names is (preview, Nov 22)', async () => {
    const deck = {
      title: 'The 1930s',
      slides: [
        {
          layout: 'timeline',
          title: 'T',
          events: [
            { date: '1932', title: 'First dust storms' },
            { date: '1939', title: 'The Grapes of Wrath' },
          ],
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(deck, owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    expect(result.deck.slides[0]!.events![0]!.image).toBeUndefined();
    expect(result.empty).toEqual([
      { subject: 'First dust storms', why: 'none' },
    ]);
    expect(result.deck.slides[0]!.events![1]!.image).toBeTruthy();
  });

  test('a person Yawp! asks for is only their own article: never a novel’s cover, a character, or a flower (preview, Nov 22)', async () => {
    const deck = {
      title: 'The Joads',
      slides: [
        {
          layout: 'person',
          title: 'The people we will follow',
          people: [
            { name: 'Tom Joad', role: 'The novel’s center' },
            { name: 'Ma Joad', role: 'The family’s spine' },
            { name: 'Rose of Sharon', role: 'Tom’s sister' },
            { name: 'Giuseppe Garibaldi', role: 'For comparison' },
          ],
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(deck, owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    expect(
      result.deck.slides[0]!.people!.map((person) => Boolean(person.image))
    ).toEqual([false, false, false, true]);
    expect(result.empty.map((miss) => miss.subject)).toEqual([
      'Tom Joad',
      'Ma Joad',
      'Rose of Sharon',
    ]);
  });

  test('what Yawp! asks for on its own never repeats a picture already on the way', async () => {
    const deck = {
      title: 'x',
      slides: [
        {
          layout: 'timeline',
          title: 'T',
          events: [{ date: '1953', title: 'The Rosenbergs executed' }],
          speakerNotes: 'n',
        },
        {
          layout: 'big_idea',
          title: 'The trial',
          body: 'b',
          wants: { subject: 'Julius and Ethel Rosenberg' },
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(deck, owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    // The planner's own request comes first and keeps the photograph; the event Yawp! asked about does not repeat it.
    expect(result.deck.slides[1]!.image).toBeTruthy();
    expect(result.deck.slides[0]!.events![0]!.image).toBeUndefined();
  });

  test('search refused: the remaining searches are skipped, and named subjects are still looked up', async () => {
    const calls: string[] = [];
    const fetcher = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      const href = String(url);
      calls.push(href);
      if (href.includes('list=search'))
        return new Response('busy', { status: 429 });
      return wikipedia().fetcher(url, init);
    }) as typeof fetch;
    const deck = {
      title: 'x',
      slides: [
        {
          layout: 'timeline',
          title: 'T',
          events: [
            { date: '1953', title: 'The Rosenbergs executed' },
            { date: '1955', title: 'Another' },
            { date: '1956', title: 'A third' },
          ],
          speakerNotes: 'n',
        },
        {
          layout: 'big_idea',
          title: 'G',
          body: 'b',
          wants: want('Giuseppe Garibaldi'),
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(deck, owner, {
      fetch: fetcher,
      shelf: shelf(),
      retryMs: 10,
    });
    expect(calls.filter((url) => url.includes('list=search')).length).toBe(2);
    expect(result.deck.slides[1]!.image).toBeTruthy();
  });
});

/** A fake second look: turns down the subjects named, keeps the rest with an alt text, and records what it saw. */
function looker(turnDown: string[] = []) {
  const seen: string[] = [];
  const look = async (
    _system: string,
    content: Array<Record<string, unknown>>
  ) => {
    const pictures: Array<Record<string, unknown>> = [];
    for (const block of content) {
      const text = typeof block.text === 'string' ? block.text : '';
      const match = /^Picture (\d+)\. Subject: ([^.]+)\./.exec(text);
      if (!match) continue;
      seen.push(match[2]!);
      const keep = !turnDown.includes(match[2]!);
      pictures.push({
        n: Number(match[1]),
        keep,
        ...(keep
          ? { alt: `A picture of ${match[2]}.` }
          : { why: 'not the thing' }),
      });
    }
    return JSON.stringify({ pictures });
  };
  return { look, seen };
}

describe('the second look (Nov 22, night)', () => {
  test('it sees every new picture once; what it turns down is never kept; what it keeps carries its alt text', async () => {
    const db = shelf();
    const { look, seen } = looker(['Giuseppe Garibaldi']);
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia().fetcher,
      shelf: db,
      look,
    });
    // Each as the slide asked for it (Risorgimento, not the article it redirects to).
    // Levittown's lead picture is not one (a landmark, not the town): it gets
    // the second try, a search of Commons, and the look sees what that found.
    expect([...new Set(seen)].sort()).toEqual(
      [
        'Giuseppe Garibaldi',
        'Levittown, New York',
        'Mary Shelley',
        'Risorgimento',
        'allen ginsberg',
      ].sort()
    );
    expect(result.deck.slides[0]!.image).toBeUndefined();
    expect(result.empty).toContainEqual({
      subject: 'Giuseppe Garibaldi',
      why: 'not the thing',
    });
    // Four lead pictures, then the two the second try found for Levittown.
    expect(result.look).toMatchObject({ turnedDown: 1, unchecked: 0 });
    expect(result.look!.seen).toBeGreaterThanOrEqual(4);
    expect(db.created.map((row) => row.subject)).not.toContain(
      'giuseppe garibaldi'
    );
    expect(
      db.created.find((row) => row.subject === 'mary shelley')?.altText
    ).toBe('A picture of Mary Shelley.');
  });

  test('a picture of mass death or cruelty is only ever the teacher’s choice: never downloaded, never shown to the model (Night, Nov 22)', async () => {
    const { look, seen } = looker();
    const calls: string[] = [];
    const { fetcher } = wikipedia();
    const watching = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push(String(url));
      return fetcher(url, init);
    }) as typeof fetch;
    const night = {
      title: 'Night',
      slides: [
        {
          layout: 'discuss',
          title: 'Talk',
          question: 'What do you already know?',
          wants: want('The Holocaust', 'prisoners in a camp'),
          speakerNotes: 'n',
        },
        {
          layout: 'notes',
          title: 'Hungary, 1944',
          facts: ['Deportations began in May.'],
          wants: want('Hungary in World War II'),
          speakerNotes: 'n',
        },
        {
          layout: 'big_idea',
          title: 'Garibaldi',
          body: 'b',
          wants: want('Giuseppe Garibaldi'),
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(night, owner, {
      fetch: watching,
      shelf: shelf(),
      look,
    });
    expect(result.deck.slides[0]!.image).toBeUndefined();
    expect(result.deck.slides[1]!.image).toBeUndefined();
    expect(result.deck.slides[2]!.image).toBeTruthy();
    expect(result.empty).toEqual([
      { subject: 'The Holocaust', why: 'for the teacher' },
      { subject: 'Hungary in World War II', why: 'for the teacher' },
    ]);
    // The article's own picture is never even fetched; the other is stopped by its description.
    expect(calls.some((url) => url.includes('Ramp'))).toBe(false);
    expect(seen).not.toContain('The Holocaust');
  });

  test('a picture kept before today’s rules is held to them again: never reused, looked up afresh', async () => {
    const db = shelf([
      {
        key: 'giuseppe garibaldi',
        id: 'ckkept0000001',
        credit:
          'Note: one or more third parties have made copyright claims against Wikimedia Commons',
      },
      {
        key: 'mary shelley',
        id: 'ckkept0000002',
        altText: 'Prisoners at Auschwitz',
      },
      {
        key: 'allen ginsberg',
        id: 'ckkept0000003',
        credit: 'Hans van Dijk, CC0',
      },
    ]);
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia().fetcher,
      shelf: db,
    });
    expect(db.copied).toEqual(['ckkept0000003']);
    expect(result.counts.reused).toBe(1);
    // The other two were found again, the way any new picture is.
    expect(db.created.map((row) => row.subject).sort()).toEqual([
      'giuseppe garibaldi',
      'mary shelley',
      'risorgimento',
    ]);
  });

  test('a look that fails keeps nothing: a picture is kept only on its word (Night, Nov 22)', async () => {
    const db = shelf();
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia().fetcher,
      shelf: db,
      look: async () => Promise.reject(new Error('overloaded')),
    });
    expect(result.deck.slides[0]!.image).toBeUndefined();
    expect(result.counts.filled).toBe(0);
    expect(db.created).toEqual([]);
    expect(result.empty.filter((miss) => miss.why === 'unchecked').length).toBe(
      4
    );
    expect(result.look).toEqual({ seen: 4, turnedDown: 0, unchecked: 4 });
  });

  test('without the second look (the model off), the rules alone decide, as before', async () => {
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    expect(result.counts.filled).toBe(4);
    expect(result.look).toBeNull();
  });

  test('a picture kept before is looked at again; kept only on its word, with the look’s alt text (Grapes rerun, Nov 22)', async () => {
    const { look, seen } = looker();
    const db = shelf([{ key: 'giuseppe garibaldi', id: 'ckkept0000001' }]);
    const { fetcher, calls } = wikipedia();
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: fetcher,
      shelf: db,
      look,
    });
    // Seen once, from the shelf: not looked up on Wikipedia again.
    expect(
      seen.filter((subject) => subject === 'Giuseppe Garibaldi').length
    ).toBe(1);
    expect(
      decodeURIComponent(
        calls.find((url) => url.includes('prop=pageimages'))!
      ).replace(/\+/g, ' ')
    ).not.toContain('Giuseppe Garibaldi');
    expect(db.copied).toEqual(['ckkept0000001']);
    expect(db.changes).toEqual([
      { altText: 'A picture of Giuseppe Garibaldi.' },
    ]);
    expect(result.deck.slides[0]!.image).toBe('ckcopy0000001');
    expect(result.counts.reused).toBe(1);
  });

  test('a kept picture the look turns down is not reused, and leaves the shelf for good', async () => {
    const { look } = looker(['Tom Joad']);
    const db = shelf([{ key: 'tom joad', id: 'ckkeptcover01' }]);
    const deck = {
      title: 'The Joads',
      slides: [
        {
          layout: 'person',
          title: 'The Joads',
          people: [{ name: 'Tom Joad', role: 'The son' }],
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    const result = await resolveDeckPictures(deck, owner, {
      fetch: wikipedia().fetcher,
      shelf: db,
      look,
    });
    expect(db.copied).toEqual([]);
    expect(db.forgotten).toEqual(['ckkeptcover01']);
    expect(result.deck.slides[0]!.people![0]!.image).toBeUndefined();
    expect(result.empty).toEqual([
      { subject: 'Tom Joad', why: 'not the thing' },
    ]);
  });

  test('a kept picture the look did not answer for is not reused, and stays on the shelf', async () => {
    const db = shelf([{ key: 'giuseppe garibaldi', id: 'ckkept0000001' }]);
    const result = await resolveDeckPictures(DECK, owner, {
      fetch: wikipedia().fetcher,
      shelf: db,
      look: async () => Promise.reject(new Error('timeout')),
    });
    expect(db.copied).toEqual([]);
    expect(db.forgotten).toEqual([]);
    expect(result.counts.reused).toBe(0);
  });
});

describe('withResolvedPictures', () => {
  test('the gallery painting is dropped, a mood not the thing, unless a look slide studies it (13-lesson review, Nov 22)', async () => {
    const { fenceSlideDeck, parseSlideDeck } = await import('./slide-deck');
    const { withResolvedPictures } = await import('./picture-lookup.server');
    const withArt = { ...DECK, kit: 'v4.1' as const, art: 'hokusai-great-wave' };
    const plain = await withResolvedPictures(`Deck.\n\n${fenceSlideDeck(withArt)}`, owner, { fetch: wikipedia().fetcher, shelf: shelf() });
    expect(parseSlideDeck(plain.reply)!.deck!.art).toBeUndefined();
    const studied = { ...withArt, slides: [...DECK.slides, { layout: 'look', title: 'Look', question: 'What do you see?', speakerNotes: 'n' } as Slide] };
    const kept = await withResolvedPictures(`Deck.\n\n${fenceSlideDeck(studied)}`, owner, { fetch: wikipedia().fetcher, shelf: shelf() });
    expect(parseSlideDeck(kept.reply)!.deck!.art).toBe('hokusai-great-wave');
  });

  test('a picture asked for and not found is a labeled slot in the slide’s notes, for the teacher (R10)', async () => {
    const { fenceSlideDeck, parseSlideDeck } = await import('./slide-deck');
    const { withResolvedPictures } = await import('./picture-lookup.server');
    const result = await withResolvedPictures(`Deck.\n\n${fenceSlideDeck(DECK)}`, owner, { fetch: wikipedia().fetcher, shelf: shelf() });
    const levittown = parseSlideDeck(result.reply)!.deck!.slides[1]!;
    expect(levittown.image).toBeUndefined();
    expect(levittown.speakerNotes).toContain('Picture to add: Levittown, New York (from the air).');
    // A slide that got its picture says nothing of the kind.
    expect(parseSlideDeck(result.reply)!.deck!.slides[0]!.speakerNotes).not.toContain('Picture to add');
  });

  test('the reply’s deck comes back with its pictures, and says which were kept', async () => {
    const { fenceSlideDeck, parseSlideDeck } = await import('./slide-deck');
    const { withResolvedPictures } = await import('./picture-lookup.server');
    const reply = `Here is the deck.\n\n${fenceSlideDeck(DECK)}`;
    const result = await withResolvedPictures(reply, owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    expect(result.reply.startsWith('Here is the deck.')).toBe(true);
    expect(parseSlideDeck(result.reply)!.deck!.slides[0]!.image).toBe(
      result.ids[0]
    );
    expect(result.ids.length).toBe(4);
    expect(result.counts.wanted).toBe(7);
  });

  test('the picture editor names a subject for a slide that asked for none, and the lookup finds it', async () => {
    const { fenceSlideDeck, parseSlideDeck } = await import('./slide-deck');
    const { withResolvedPictures } = await import('./picture-lookup.server');
    const bare = {
      title: 'Italy',
      slides: [
        { layout: 'title', title: 'Italy', speakerNotes: 'n' },
        {
          layout: 'big_idea',
          title: 'The general',
          body: 'A thousand volunteers in red shirts took Sicily in 1860.',
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    let prompt = '';
    const result = await withResolvedPictures(
      `Deck.\n\n${fenceSlideDeck(bare)}`,
      owner,
      {
        fetch: wikipedia().fetcher,
        shelf: shelf(),
        name: async (_system, text) => {
          prompt = text;
          return '{"slides": [{"slide": 2, "subject": "Giuseppe Garibaldi", "shows": "his portrait"}]}';
        },
      }
    );
    expect(prompt).toContain('A thousand volunteers in red shirts');
    expect(result.named).toBe(1);
    const deck = parseSlideDeck(result.reply)!.deck!;
    expect(deck.slides[1]!.wants).toEqual({
      subject: 'Giuseppe Garibaldi',
      shows: 'his portrait',
    });
    expect(deck.slides[1]!.image).toBe(result.ids[0]);
  });

  test('a reply with no deck is untouched', async () => {
    const { withResolvedPictures } = await import('./picture-lookup.server');
    const result = await withResolvedPictures('Just a plan, no deck.', owner, {
      fetch: wikipedia().fetcher,
      shelf: shelf(),
    });
    expect(result.reply).toBe('Just a plan, no deck.');
    expect(result.ids).toEqual([]);
  });
});

describe('the second try: what Commons is searched for (visuals review, Nov 22)', () => {
  test('the subject, then the words of "should show" that say which one', () => {
    expect(searchWords({ subject: 'Gas mask', shows: 'Early World War I gas mask worn by soldiers on the Western Front' })).toBe('Gas mask Early World War soldiers Western');
    expect(searchWords({ subject: 'Tenement', shows: 'A crowded New York tenement in the 1890s' })).toBe('Tenement crowded New York 1890s');
  });
  test('a phrase the planner gave to find it by is used as it is', () => {
    expect(searchWords({ subject: 'Owen killed', find: 'Wilfred Owen 1918', shows: 'x' })).toBe('Wilfred Owen 1918');
    // Commons wants every word: two words of "shows", then the subject alone (Nov 23).
    expect(searchQueries({ subject: 'Battle of Salamis (480 BC)', shows: 'Greek triremes ramming Persian ships in the strait' })).toEqual(['Battle of Salamis Greek triremes', 'Battle of Salamis']);
    expect(searchQueries({ subject: 'Socrates' })).toEqual(['Socrates']);
    expect(searchQueries({ subject: 'Owen killed', find: 'Wilfred Owen 1918' })).toEqual(['Wilfred Owen 1918']);
  });
});
