import { describe, expect, test } from 'bun:test';

import {
  artworkMd5,
  isRetiredSeedArtwork,
  syncSeedArtwork,
} from './assignment-type-artwork';

const CURRENT = {
  blob: Buffer.from('current artwork bytes'),
  contentType: 'image/jpeg',
  altText: 'The current drawing.',
};
const RETIRED = Buffer.from('the drawing a seed shipped last year');
const RETIRED_MD5S = [artworkMd5(RETIRED)];

type ImageRow = {
  id: string;
  assignmentTypeId: string;
  blob: Uint8Array;
  contentType: string;
  altText: string | null;
};

function fakePrisma(existing: ImageRow | null) {
  const calls: { create: unknown[]; update: unknown[] } = {
    create: [],
    update: [],
  };
  const prisma = {
    assignmentTypeImage: {
      findUnique: async () => existing,
      create: async (args: unknown) => {
        calls.create.push(args);
        return { id: 'image-1' };
      },
      update: async (args: unknown) => {
        calls.update.push(args);
        return { id: existing?.id ?? 'image-1' };
      },
    },
  };
  return { prisma, calls };
}

describe('isRetiredSeedArtwork', () => {
  test('recognises bytes a seed shipped earlier', () => {
    expect(isRetiredSeedArtwork(RETIRED, RETIRED_MD5S)).toBe(true);
    expect(isRetiredSeedArtwork(new Uint8Array(RETIRED), RETIRED_MD5S)).toBe(
      true
    );
  });

  test('treats anything else as somebody else\'s upload', () => {
    expect(isRetiredSeedArtwork(Buffer.from('a teacher upload'), RETIRED_MD5S)).toBe(
      false
    );
    expect(isRetiredSeedArtwork(CURRENT.blob, RETIRED_MD5S)).toBe(false);
    expect(isRetiredSeedArtwork(null, RETIRED_MD5S)).toBe(false);
    expect(isRetiredSeedArtwork(undefined, RETIRED_MD5S)).toBe(false);
    expect(isRetiredSeedArtwork(RETIRED, [])).toBe(false);
  });
});

describe('syncSeedArtwork', () => {
  test('creates the image when the type has none', async () => {
    const { prisma, calls } = fakePrisma(null);

    const outcome = await syncSeedArtwork(
      prisma as never,
      'type-1',
      CURRENT,
      RETIRED_MD5S
    );

    expect(outcome).toBe('created');
    expect(calls.create).toEqual([
      {
        data: {
          assignmentTypeId: 'type-1',
          blob: CURRENT.blob,
          contentType: 'image/jpeg',
          altText: 'The current drawing.',
        },
      },
    ]);
    expect(calls.update).toHaveLength(0);
  });

  /**
   * The point of the retired list: artwork the repo itself put there earlier
   * is the repo's to replace, so a redrawn card reaches every database that
   * still shows the old drawing without anybody deleting rows by hand.
   */
  test('replaces artwork a seed shipped earlier with the current drawing', async () => {
    const { prisma, calls } = fakePrisma({
      id: 'image-old',
      assignmentTypeId: 'type-1',
      blob: RETIRED,
      contentType: 'image/jpeg',
      altText: 'The old drawing.',
    });

    const outcome = await syncSeedArtwork(
      prisma as never,
      'type-1',
      CURRENT,
      RETIRED_MD5S
    );

    expect(outcome).toBe('replaced');
    expect(calls.create).toHaveLength(0);
    expect(calls.update).toHaveLength(1);
    const update = calls.update[0] as {
      where: { assignmentTypeId: string };
      data: Record<string, unknown>;
    };
    expect(update.where).toEqual({ assignmentTypeId: 'type-1' });
    expect(update.data.blob).toBe(CURRENT.blob);
    expect(update.data.contentType).toBe('image/jpeg');
    expect(update.data.altText).toBe('The current drawing.');
    expect(update.data.updatedAt).toBeInstanceOf(Date);
  });

  /**
   * An admin who uploaded their own artwork keeps it. Re-running a seed fills
   * a gap or retires the seed's own drawing; it never reverts somebody's upload.
   */
  test('leaves an image it did not ship alone', async () => {
    const { prisma, calls } = fakePrisma({
      id: 'image-custom',
      assignmentTypeId: 'type-1',
      blob: Buffer.from('a teacher upload'),
      contentType: 'image/png',
      altText: null,
    });

    const outcome = await syncSeedArtwork(
      prisma as never,
      'type-1',
      CURRENT,
      RETIRED_MD5S
    );

    expect(outcome).toBe('kept');
    expect(calls.create).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });

  test('does nothing when the current drawing is already there', async () => {
    const { prisma, calls } = fakePrisma({
      id: 'image-current',
      assignmentTypeId: 'type-1',
      blob: CURRENT.blob,
      contentType: 'image/jpeg',
      altText: CURRENT.altText,
    });

    const outcome = await syncSeedArtwork(
      prisma as never,
      'type-1',
      CURRENT,
      RETIRED_MD5S
    );

    expect(outcome).toBe('kept');
    expect(calls.create).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });
});
