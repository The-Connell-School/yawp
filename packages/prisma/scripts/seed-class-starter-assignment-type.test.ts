import { describe, expect, test } from 'bun:test';

import { readFileSync } from 'node:fs';

import {
  CLASS_STARTER_ASSIGNMENT_TYPE_DATA,
  CLASS_STARTER_IMAGE_PATH,
  CLASS_STARTER_KIND,
  MissingOrganizationError,
  readClassStarterImage,
  seedClassStarterAssignmentType,
} from './seed-class-starter-assignment-type';

type Call = { args: unknown };

function fakePrisma({ orgId = 'org-1' }: { orgId?: string | null } = {}) {
  const calls: Record<string, Call[]> = {
    assignmentTypeUpsert: [],
    orgAssignmentTypeUpsert: [],
    imageUpsert: [],
  };

  const prisma = {
    organization: {
      findFirst: async () => (orgId ? { id: orgId } : null),
    },
    assignmentType: {
      upsert: async (args: unknown) => {
        calls.assignmentTypeUpsert.push({ args });
        return { id: 'assignment-type-1' };
      },
    },
    organizationAssignmentType: {
      upsert: async (args: unknown) => {
        calls.orgAssignmentTypeUpsert.push({ args });
        return {};
      },
    },
    assignmentTypeImage: {
      upsert: async (args: unknown) => {
        calls.imageUpsert.push({ args });
        return { id: 'image-1' };
      },
    },
  };

  return { prisma, calls };
}

describe('seedClassStarterAssignmentType', () => {
  test('upserts on the class_starter kind, so it can be run twice', async () => {
    const { prisma, calls } = fakePrisma();

    await seedClassStarterAssignmentType(prisma as never);

    expect(calls.assignmentTypeUpsert).toHaveLength(1);
    const args = calls.assignmentTypeUpsert[0].args as {
      where: { kind: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };

    expect(args.where).toEqual({ kind: CLASS_STARTER_KIND });
    expect(args.create.kind).toBe(CLASS_STARTER_KIND);
    expect(args.create.title).toBe('Class Starter');
  });

  /**
   * `kind` is what selects the Class Starter grading assistant. A row created
   * without it grades on the thesis-driven essay rubric, which is the failure
   * this whole script exists to prevent.
   */
  test('always carries the kind the grading assistant is keyed to', () => {
    expect(CLASS_STARTER_KIND).toBe('class_starter');
    expect(CLASS_STARTER_ASSIGNMENT_TYPE_DATA.title).toBe('Class Starter');
  });

  test('un-archives an existing row rather than leaving it hidden', async () => {
    const { prisma, calls } = fakePrisma();

    await seedClassStarterAssignmentType(prisma as never);

    const args = calls.assignmentTypeUpsert[0].args as {
      update: Record<string, unknown>;
    };
    expect(args.update.archivedAt).toBeNull();
  });

  test('does not reassign the owning org of a row that already exists', async () => {
    const { prisma, calls } = fakePrisma();

    await seedClassStarterAssignmentType(prisma as never);

    const args = calls.assignmentTypeUpsert[0].args as {
      update: Record<string, unknown>;
    };
    expect(args.update).not.toHaveProperty('ownerOrgId');
    expect(args.update).not.toHaveProperty('organizationAssignments');
  });

  test('links the type to the organization so it shows up for teachers', async () => {
    const { prisma, calls } = fakePrisma({ orgId: 'org-42' });

    await seedClassStarterAssignmentType(prisma as never);

    expect(calls.orgAssignmentTypeUpsert).toHaveLength(1);
    const args = calls.orgAssignmentTypeUpsert[0].args as {
      where: { organizationId_assignmentTypeId: Record<string, string> };
    };
    expect(args.where.organizationId_assignmentTypeId).toEqual({
      organizationId: 'org-42',
      assignmentTypeId: 'assignment-type-1',
    });
  });

  /**
   * This seed runs inside the preview deploy's `&&` chain, so "no organization"
   * has to be distinguishable from a real failure: the CLI treats this one as a
   * skip so an empty database cannot take a preview deployment down with it,
   * while anything else still fails loudly.
   */
  test('refuses to seed into a database with no organization', async () => {
    const { prisma, calls } = fakePrisma({ orgId: null });

    const error = await seedClassStarterAssignmentType(prisma as never).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(MissingOrganizationError);
    expect((error as Error).message).toMatch(/organization/i);
    expect(calls.assignmentTypeUpsert).toHaveLength(0);
  });
});

describe('the Class Starter assignment type image', () => {
  test('the committed asset is a 940x788 JPEG, matching the Daily Pages image', () => {
    const bytes = readFileSync(CLASS_STARTER_IMAGE_PATH);

    // JPEG SOI marker.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);

    // Walk the segments to the frame header, which carries the dimensions.
    let offset = 2;
    let dimensions: { width: number; height: number } | null = null;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        dimensions = {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
        break;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }

    expect(dimensions).toEqual({ width: 940, height: 788 });
  });

  test('readClassStarterImage returns the asset bytes and its content type', () => {
    const image = readClassStarterImage();

    expect(image.contentType).toBe('image/jpeg');
    expect(image.blob.length).toBeGreaterThan(1000);
    expect(image.blob.equals(readFileSync(CLASS_STARTER_IMAGE_PATH))).toBe(true);
    expect(image.altText?.length).toBeGreaterThan(0);
  });

  test('attaches the image to the assignment type it just seeded', async () => {
    const { prisma, calls } = fakePrisma();

    await seedClassStarterAssignmentType(prisma as never);

    expect(calls.imageUpsert).toHaveLength(1);
    const args = calls.imageUpsert[0].args as {
      where: { assignmentTypeId: string };
      create: { contentType: string; blob: Buffer };
    };

    expect(args.where).toEqual({ assignmentTypeId: 'assignment-type-1' });
    expect(args.create.contentType).toBe('image/jpeg');
    expect(args.create.blob.length).toBeGreaterThan(1000);
  });

  /**
   * An admin who uploads their own artwork should keep it. Re-running the seed
   * is for filling a gap, never for reverting somebody's upload — same rule the
   * assignment type's own update half follows.
   */
  test('never overwrites an image that is already there', async () => {
    const { prisma, calls } = fakePrisma();

    await seedClassStarterAssignmentType(prisma as never);

    const args = calls.imageUpsert[0].args as { update: Record<string, unknown> };
    expect(args.update).toEqual({});
  });
});
