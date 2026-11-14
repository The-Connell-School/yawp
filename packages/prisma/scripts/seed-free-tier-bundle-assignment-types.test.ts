import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '../generated/prisma';
import { artworkMd5 } from './assignment-type-artwork';
import {
  BUNDLE_RETIRED_ARTWORK_MD5S,
  BUNDLE_TILE_IMAGES,
  ensureBundleTypeImage,
  readBundleTileImage,
  seedFreeTierBundleAssignmentTypes,
} from './seed-free-tier-bundle-assignment-types';
import { buildPrismaPgPoolConfig } from './local-dev/connection';
import { CLASS_STARTER_KIND } from './seed-class-starter-assignment-type';

const PREWRITING_KIND = 'prewriting';
const THESIS_STATEMENT_KIND = 'thesis_statement';

describe('seed-free-tier-bundle-assignment-types connection', () => {
  test('uses TLS when running through the production migration tunnel', () => {
    expect(
      buildPrismaPgPoolConfig(
        'postgresql://yawp:secret@localhost:3306/yawp',
        { REMOTE_MIGRATE_TUNNEL: '1' }
      )
    ).toEqual({
      connectionString: 'postgresql://yawp:secret@localhost:3306/yawp',
      ssl: { rejectUnauthorized: false },
    });
  });

  test('keeps local migration validation non-TLS', () => {
    expect(
      buildPrismaPgPoolConfig(
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
        {}
      )
    ).toEqual({
      connectionString:
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
      ssl: false,
    });
  });
});

describe('seedFreeTierBundleAssignmentTypes', () => {
  test('creates parent assignment types separately from module rows', async () => {
    const createdTypes = new Map<string, { id: string; kind: string }>();
    const prisma = {
      assignmentType: {
        upsert: mock(() => {
          throw new Error('nested assignmentType.upsert should not be used');
        }),
        findUnique: mock(
          ({ where }: { where: { kind?: string; id?: string } }) => {
            if (where.kind) return createdTypes.get(where.kind) ?? null;
            return null;
          }
        ),
        findFirst: mock(() => null),
        create: mock(
          ({
            data,
          }: {
            data: { kind: string; title: string; position: number };
          }) => {
            const row = { id: `${data.kind}-id`, kind: data.kind };
            createdTypes.set(data.kind, row);
            return row;
          }
        ),
        update: mock(({ where }: { where: { id: string } }) => ({
          id: where.id,
        })),
        findMany: mock(() =>
          Array.from(createdTypes.values()).map((row) => ({
            ...row,
            rubricJson: { categories: [] },
            assignmentModules: [{ id: `${row.id}-module` }],
          }))
        ),
      },
      assignmentModule: {
        count: mock(() => 0),
        create: mock(({ data }: { data: { assignmentTypeId: string } }) => ({
          id: `${data.assignmentTypeId}-module`,
        })),
      },
      assignmentTypeImage: {
        upsert: mock(() => ({ id: 'image-id' })),
        create: mock(() => ({ id: 'image-id' })),
        update: mock(() => ({ id: 'image-id' })),
        // A card somebody uploaded: not the seed's to replace.
        findUnique: mock(() => ({ id: 'image-id', blob: Buffer.from('custom') })),
      },
      $executeRawUnsafe: mock(() => ({})),
      organization: {
        findMany: mock(() => []),
      },
      organizationAssignmentType: {
        upsert: mock(() => ({})),
      },
    } as unknown as PrismaClient;

    await seedFreeTierBundleAssignmentTypes(prisma);

    expect(prisma.assignmentType.upsert).not.toHaveBeenCalled();
    expect(prisma.assignmentType.create).toHaveBeenCalled();
    expect(prisma.assignmentModule.create).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
    expect(prisma.assignmentTypeImage.upsert).not.toHaveBeenCalled();
    expect(prisma.assignmentTypeImage.create).not.toHaveBeenCalled();
    expect(prisma.assignmentTypeImage.update).not.toHaveBeenCalled();
    expect(prisma.assignmentTypeImage.findUnique).toHaveBeenCalled();
  });
});

function jpegDimensions(bytes: Buffer) {
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  let offset = 2;
  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}

function fakePrisma(existing: { blob: Uint8Array } | null) {
  const calls: { create: unknown[]; update: unknown[] } = {
    create: [],
    update: [],
  };
  const prisma = {
    assignmentTypeImage: {
      findUnique: async () => (existing ? { id: 'image-1', ...existing } : null),
      create: async (args: unknown) => {
        calls.create.push(args);
        return { id: 'image-1' };
      },
      update: async (args: unknown) => {
        calls.update.push(args);
        return { id: 'image-1' };
      },
    },
  };
  return { prisma, calls };
}

describe('the free tier bundle tile artwork', () => {
  test.each([PREWRITING_KIND, THESIS_STATEMENT_KIND, CLASS_STARTER_KIND])(
    '%s ships a 940x788 JPEG with a description of the drawing',
    (kind) => {
      const spec = BUNDLE_TILE_IMAGES[kind];
      expect(spec).toBeDefined();

      const image = readBundleTileImage(spec.file, spec.altText);
      expect(image.contentType).toBe('image/jpeg');
      expect(jpegDimensions(image.blob)).toEqual({ width: 940, height: 788 });
      expect(image.altText.length).toBeGreaterThan(20);
    }
  );

  test('the Pre-Writing and Thesis Statement cards are the dog-in-a-beret art, without a wordmark', () => {
    expect(BUNDLE_TILE_IMAGES[PREWRITING_KIND].altText).toMatch(/beret/);
    expect(BUNDLE_TILE_IMAGES[PREWRITING_KIND].altText).toMatch(/lightbulb/);
    expect(BUNDLE_TILE_IMAGES[THESIS_STATEMENT_KIND].altText).toMatch(/beret/);
    expect(BUNDLE_TILE_IMAGES[THESIS_STATEMENT_KIND].altText).toMatch(/yawp!/);
    // The tile prints the title, so the cards carry no wordmark.
    expect(BUNDLE_TILE_IMAGES[PREWRITING_KIND].altText).not.toMatch(/Pre-Writing/);
    expect(BUNDLE_TILE_IMAGES[THESIS_STATEMENT_KIND].altText).not.toMatch(
      /Thesis Statement/
    );
  });

  /**
   * Every drawing the seed has ever shipped stays on the retired list, so a
   * database still showing one of them gets the current card on the next run.
   * The current card itself must not be there, or the seed would rewrite the
   * same bytes on every deploy.
   */
  test('retires the previous drawings without retiring the current ones', () => {
    for (const kind of [PREWRITING_KIND, THESIS_STATEMENT_KIND, CLASS_STARTER_KIND]) {
      const retired = BUNDLE_RETIRED_ARTWORK_MD5S[kind];
      expect(retired.length).toBeGreaterThan(0);
      for (const md5 of retired) expect(md5).toMatch(/^[0-9a-f]{32}$/);

      const spec = BUNDLE_TILE_IMAGES[kind];
      const current = readFileSync(join(import.meta.dir, 'assets', spec.file));
      expect(retired).not.toContain(artworkMd5(current));
    }

    // The first drawings, before the November 2026 redraw.
    expect(BUNDLE_RETIRED_ARTWORK_MD5S[PREWRITING_KIND]).toContain(
      '2e22d9bede4d3eee6d1ca26a446ef931'
    );
    expect(BUNDLE_RETIRED_ARTWORK_MD5S[THESIS_STATEMENT_KIND]).toContain(
      'c024adc8c638fbec53ac10bb4cb86d18'
    );
    expect(BUNDLE_RETIRED_ARTWORK_MD5S[CLASS_STARTER_KIND]).toContain(
      '429eac2e3a0b56f3140f6a8da4382101'
    );
  });
});

describe('ensureBundleTypeImage', () => {
  test('attaches the card to a type that has none', async () => {
    const { prisma, calls } = fakePrisma(null);

    await ensureBundleTypeImage(prisma as never, 'type-1', PREWRITING_KIND);

    expect(calls.create).toHaveLength(1);
    const create = calls.create[0] as {
      data: { assignmentTypeId: string; contentType: string; blob: Buffer; altText: string };
    };
    expect(create.data.assignmentTypeId).toBe('type-1');
    expect(create.data.contentType).toBe('image/jpeg');
    expect(create.data.blob.length).toBeGreaterThan(1000);
    expect(create.data.altText).toBe(BUNDLE_TILE_IMAGES[PREWRITING_KIND].altText);
    expect(calls.update).toHaveLength(0);
  });

  test('swaps a card the seed drew earlier for the current one', async () => {
    const retiredBytes = Buffer.from('retired prewriting card');
    BUNDLE_RETIRED_ARTWORK_MD5S[PREWRITING_KIND].push(artworkMd5(retiredBytes));
    try {
      const { prisma, calls } = fakePrisma({ blob: retiredBytes });

      await ensureBundleTypeImage(prisma as never, 'type-1', PREWRITING_KIND);

      expect(calls.create).toHaveLength(0);
      expect(calls.update).toHaveLength(1);
      const update = calls.update[0] as {
        where: { assignmentTypeId: string };
        data: { blob: Buffer; altText: string };
      };
      expect(update.where).toEqual({ assignmentTypeId: 'type-1' });
      expect(update.data.altText).toBe(BUNDLE_TILE_IMAGES[PREWRITING_KIND].altText);
      expect(
        update.data.blob.equals(
          readFileSync(join(import.meta.dir, 'assets', 'prewriting.jpg'))
        )
      ).toBe(true);
    } finally {
      BUNDLE_RETIRED_ARTWORK_MD5S[PREWRITING_KIND].pop();
    }
  });

  test('keeps a card somebody uploaded themselves', async () => {
    const { prisma, calls } = fakePrisma({ blob: Buffer.from('a school logo') });

    await ensureBundleTypeImage(prisma as never, 'type-1', THESIS_STATEMENT_KIND);

    expect(calls.create).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });

  test('ignores kinds that have no card', async () => {
    const { prisma, calls } = fakePrisma(null);

    await ensureBundleTypeImage(prisma as never, 'type-1', 'daily_pages');

    expect(calls.create).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });
});
