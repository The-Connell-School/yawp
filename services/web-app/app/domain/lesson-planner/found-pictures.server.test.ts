/**
 * Pictures that belong (Kevin, Nov 21; slides that teach, phase 2): the
 * planner asks for a picture of the real place or person, Yawp! searches an
 * open collection, keeps only what its license lets us show, and stores a
 * copy with the lesson. The model never writes a picture address.
 */
import { describe, expect, test } from 'bun:test';
import { findPicturesForLesson, openLicense, searchOpenPictures, type PictureStore } from './found-pictures.server';

// A 2×1 PNG: a real raster the sniffer accepts.
const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZYAQAZ/gH+Z3ZzW4AAAAASUVORK5CYII=', 'base64')
);

const page = (index: number, title: string, license: string, extra: Record<string, unknown> = {}) => ({
  index,
  title: `File:${title}`,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(title)}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}/1280px-x.jpg`,
      thumbwidth: 1280,
      thumbheight: 900,
      width: 3000,
      height: 2100,
      mime: 'image/jpeg',
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      extmetadata: {
        LicenseShortName: { value: license },
        Artist: { value: '<a href="//x">Mathew Brady</a>' },
        ImageDescription: { value: '<p>Giuseppe <b>Garibaldi</b>, photographed in 1861.</p>' },
        ObjectName: { value: title.replace(/\.\w+$/, '') },
        ...extra,
      },
    },
  ],
});

function commons(pages: unknown[], status = 200) {
  const calls: string[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    expect(new Headers(init?.headers).get('user-agent')).toContain('Yawp');
    if (href.includes('/w/api.php')) {
      if (status !== 200) return new Response('busy', { status });
      return new Response(JSON.stringify({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } }), { status: 200 });
    }
    return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  return { fetcher: fetcher as typeof fetch, calls };
}

function store(): PictureStore & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    async create(data) {
      const row = { id: `ckfound${String(rows.length + 1).padStart(5, '0')}`, ...data };
      rows.push(row);
      return { id: row.id };
    },
  };
}

describe('openLicense', () => {
  test('public domain, CC0, CC BY and CC BY-SA, and nothing else', () => {
    expect(openLicense('Public domain')).toBe('Public domain');
    expect(openLicense('PD-US')).toBe('Public domain');
    expect(openLicense('CC0')).toBe('CC0');
    expect(openLicense('CC BY 4.0')).toBe('CC BY 4.0');
    expect(openLicense('CC BY-SA 3.0')).toBe('CC BY-SA 3.0');
    for (const closed of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'Fair use', 'Copyrighted', '', undefined]) expect(openLicense(closed)).toBeNull();
  });
});

describe('searchOpenPictures', () => {
  test('only open licenses, big enough, with the credit read from the collection', async () => {
    const { fetcher, calls } = commons([
      page(1, 'Garibaldi 1861.jpg', 'Public domain'),
      page(2, 'Garibaldi poster.jpg', 'CC BY-NC 4.0'),
      page(3, 'Garibaldi statue.jpg', 'CC BY-SA 4.0', { Artist: { value: 'Jane Smith' } }),
    ]);
    const found = await searchOpenPictures('Giuseppe Garibaldi photograph', { fetch: fetcher });
    expect(calls[0]).toContain('commons.wikimedia.org/w/api.php');
    expect(calls[0]).toContain('filetype%3Abitmap');
    expect(found.map((picture) => picture.title)).toEqual(['Garibaldi 1861', 'Garibaldi statue']);
    expect(found[0]).toMatchObject({
      license: 'Public domain',
      credit: 'Mathew Brady, Garibaldi 1861, Public domain, via Wikimedia Commons',
      description: 'Giuseppe Garibaldi, photographed in 1861.',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Garibaldi%201861.jpg',
    });
    expect(found[1]!.credit).toBe('Jane Smith, Garibaldi statue, CC BY-SA 4.0, via Wikimedia Commons');
  });

  test('real Commons metadata: the Credit line when there is no Artist, the file’s type from its name when Commons leaves it out', async () => {
    const wellcome = page(1, 'Giovanni Aldini, galvanism experiments Wellcome L0007025.jpg', 'CC BY 4.0', {
      Artist: undefined,
      Credit: { value: '<a href="//wellcomeimages.org">Wellcome Collection</a>' },
    });
    delete (wellcome.imageinfo[0] as { mime?: string }).mime;
    const { fetcher } = commons([wellcome]);
    const found = await searchOpenPictures('Aldini galvanism', { fetch: fetcher });
    expect(found.length).toBe(1);
    expect(found[0]!.credit).toBe('Wellcome Collection, Giovanni Aldini, galvanism experiments Wellcome L0007025, CC BY 4.0, via Wikimedia Commons');
  });

  test('a credit that is an address, or an unknown author said twice, reads cleanly', async () => {
    const { fetcher } = commons([
      page(1, 'Aldini plate.jpg', 'CC BY 4.0', { Artist: undefined, Credit: { value: '<a href="https://wellcomeimages.org/x">https://wellcomeimages.org/indexplus/obf_images/f7/93/3b.html</a>' } }),
      page(2, 'Prohibition disposal.jpg', 'Public domain', { Artist: { value: 'Unknown authorUnknown author' } }),
    ]);
    const found = await searchOpenPictures('x', { fetch: fetcher });
    expect(found[0]!.credit).toBe('wellcomeimages.org, Aldini plate, CC BY 4.0, via Wikimedia Commons');
    expect(found[1]!.credit).toBe('Prohibition disposal, Public domain, via Wikimedia Commons');
  });

  test('a picture too small to project is left out', async () => {
    const small = page(1, 'Tiny.jpg', 'Public domain');
    small.imageinfo[0]!.width = 200;
    small.imageinfo[0]!.thumbwidth = 200;
    const { fetcher } = commons([small]);
    expect(await searchOpenPictures('tiny', { fetch: fetcher })).toEqual([]);
  });
});

describe('findPicturesForLesson', () => {
  const owner = { membershipId: 'm1', conversationId: 'c1' };

  test('keeps up to three, stored with the lesson and their credit, and hands back their ids', async () => {
    const { fetcher } = commons([1, 2, 3, 4].map((i) => page(i, `Palermo ${i}.jpg`, 'Public domain')));
    const db = store();
    const result = await findPicturesForLesson({ query: 'Palermo 1860' }, owner, { fetch: fetcher, store: db });
    expect(result.pictures.map((picture) => picture.id)).toEqual(['ckfound00001', 'ckfound00002', 'ckfound00003']);
    expect(db.rows[0]).toMatchObject({
      membershipId: 'm1',
      conversationId: 'c1',
      origin: 'found',
      license: 'Public domain',
      credit: 'Mathew Brady, Palermo 1, Public domain, via Wikimedia Commons',
      contentType: 'image/png',
      width: 2,
      height: 1,
    });
    expect(result.pictures[0]).toMatchObject({ shows: 'Giuseppe Garibaldi, photographed in 1861.', credit: 'Mathew Brady, Palermo 1, Public domain, via Wikimedia Commons' });
    expect(result.note).toContain('image');
  });

  test('a busy collection is said plainly, and nothing is stored', async () => {
    const { fetcher } = commons([], 429);
    const db = store();
    const result = await findPicturesForLesson({ query: 'Palermo' }, owner, { fetch: fetcher, store: db });
    expect(result.pictures).toEqual([]);
    expect(result.note).toContain('ask the teacher');
    expect(db.rows).toEqual([]);
  });

  test('a file that is not a picture is never stored', async () => {
    const { fetcher } = commons([page(1, 'Palermo.jpg', 'Public domain')]);
    const notAPicture = (async (url: string | URL | Request, init?: RequestInit) =>
      String(url).includes('/w/api.php') ? fetcher(url, init) : new Response('<html>no</html>', { status: 200 })) as typeof fetch;
    const db = store();
    const result = await findPicturesForLesson({ query: 'Palermo' }, owner, { fetch: notAPicture, store: db });
    expect(result.pictures).toEqual([]);
    expect(db.rows).toEqual([]);
  });

  test('an empty query asks for one', async () => {
    const db = store();
    const result = await findPicturesForLesson({ query: '  ' }, owner, { fetch: commons([]).fetcher, store: db });
    expect(result.pictures).toEqual([]);
    expect(result.note).toContain('what the picture should show');
  });
});

describe('never holding up the lesson (preview, Nov 21: a unit day timed out)', () => {
  const owner = { membershipId: 'm1', conversationId: null };

  test('every picture a deck needs in one call: the searches run together, a few kept for each', async () => {
    const { fetcher, calls } = commons([1, 2, 3, 4].map((i) => page(i, `Picture ${i}.jpg`, 'Public domain')));
    const db = store();
    const result = await findPicturesForLesson({ queries: ['Dust Bowl farm 1936', 'John Steinbeck photograph', 'Salinas Valley 1930s'] }, owner, { fetch: fetcher, store: db });
    expect(calls.filter((url) => url.includes('/w/api.php')).length).toBe(3);
    expect(result.pictures.length).toBe(6);
    expect(result.pictures.map((picture) => picture.for)).toEqual([
      'Dust Bowl farm 1936', 'Dust Bowl farm 1936', 'John Steinbeck photograph', 'John Steinbeck photograph', 'Salinas Valley 1930s', 'Salinas Valley 1930s',
    ]);
  });

  test('a collection that never answers gives up in seconds, not minutes', async () => {
    const hangs = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch;
    const started = Date.now();
    const result = await findPicturesForLesson({ query: 'Palermo' }, owner, { fetch: hangs, store: store(), timeoutMs: 200 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.pictures).toEqual([]);
    expect(result.note).toContain('ask the teacher');
  });

  test('a download that never arrives is skipped, and the others are kept', async () => {
    const { fetcher } = commons([1, 2].map((i) => page(i, `Picture ${i}.jpg`, 'Public domain')));
    const oneHangs = ((url: string | URL | Request, init?: RequestInit) =>
      String(url).includes('Picture%201')
        ? new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
        : fetcher(url, init)) as typeof fetch;
    const result = await findPicturesForLesson({ query: 'x' }, owner, { fetch: oneHangs, store: store(), timeoutMs: 200 });
    expect(result.pictures.length).toBe(1);
  });
});
