import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import {
  bootstrapExitTicketAssignmentType,
  EXIT_TICKET_BOOTSTRAP_IMAGE_MD5,
  EXIT_TICKET_INSTRUCTION_ID,
  EXIT_TICKET_MODULE_ID,
  EXIT_TICKET_RETIRED_ARTWORK_MD5S,
} from './bootstrap-exit-ticket-assignment-type';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_ID,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
} from './exit-ticket-assignment-type-data';

type Store = {
  assignmentType: Record<string, unknown> | null;
  orgGrants: Set<string>;
  schoolGrants: Set<string>;
  teacherGrants: Set<string>;
  image: Record<string, unknown> | null;
  moduleCreated: boolean;
};

function makePrisma(initial?: Partial<Store>) {
  const store: Store = {
    assignmentType: initial?.assignmentType ?? null,
    orgGrants: new Set(initial?.orgGrants ?? []),
    schoolGrants: new Set(initial?.schoolGrants ?? []),
    teacherGrants: new Set(initial?.teacherGrants ?? []),
    image: initial?.image ?? null,
    moduleCreated: false,
  };

  const prisma = {
    assignmentType: {
      findUnique: async () => store.assignmentType,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.assignmentType = { id: data.id, ...data };
        store.moduleCreated = true;
        return { id: String(data.id) };
      },
    },
    assignmentModule: {
      findFirst: async () =>
        store.moduleCreated ? { id: EXIT_TICKET_MODULE_ID } : null,
      create: async () => {
        store.moduleCreated = true;
        return { id: EXIT_TICKET_MODULE_ID };
      },
    },
    organizationAssignmentType: {
      upsert: async ({
        where,
        create,
      }: {
        where: {
          organizationId_assignmentTypeId: {
            organizationId: string;
            assignmentTypeId: string;
          };
        };
        create: { organizationId: string; assignmentTypeId: string };
        update: Record<string, never>;
      }) => {
        const key = `${where.organizationId_assignmentTypeId.organizationId}:${where.organizationId_assignmentTypeId.assignmentTypeId}`;
        store.orgGrants.add(key);
        return create;
      },
    },
    schoolAssignmentType: {
      upsert: async ({
        create,
      }: {
        create: { schoolId: string; assignmentTypeId: string };
      }) => {
        store.schoolGrants.add(
          `${create.schoolId}:${create.assignmentTypeId}`
        );
        return create;
      },
    },
    teacherAssignmentType: {
      upsert: async ({
        create,
      }: {
        create: { membershipId: string; assignmentTypeId: string };
      }) => {
        store.teacherGrants.add(
          `${create.membershipId}:${create.assignmentTypeId}`
        );
        return create;
      },
    },
    assignmentTypeImage: {
      findUnique: async () => store.image,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.image = data;
        return { id: 'image-1' };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        store.image = { ...store.image, ...data };
        return { id: 'image-1' };
      },
    },
  };

  return { prisma, store };
}

describe('bootstrapExitTicketAssignmentType', () => {
  test('creates the type and org grants on first run', async () => {
    const { prisma, store } = makePrisma();
    await bootstrapExitTicketAssignmentType(prisma as never, {
      organizationIds: ['org-1'],
      attachImageIfMissing: false,
    });

    expect(store.assignmentType).toMatchObject({
      id: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
      kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
      title: 'Exit Ticket',
    });
    expect(store.orgGrants.has(`org-1:${EXIT_TICKET_ASSIGNMENT_TYPE_ID}`)).toBe(
      true
    );
    expect(store.schoolGrants.size).toBe(0);
    expect(store.teacherGrants.size).toBe(0);
  });

  test('on rerun preserves admin edits and does not touch customized lists', async () => {
    const { prisma, store } = makePrisma({
      assignmentType: {
        id: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
        kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
        title: 'Custom Exit Ticket Title',
        description: 'Admin wrote this',
        position: 99,
        archivedAt: new Date('2026-01-01'),
      },
      image: { assignmentTypeId: EXIT_TICKET_ASSIGNMENT_TYPE_ID, blob: 'x' },
    });

    await bootstrapExitTicketAssignmentType(prisma as never, {
      organizationIds: ['org-1', 'org-2'],
      attachImageIfMissing: true,
    });

    expect(store.assignmentType).toMatchObject({
      title: 'Custom Exit Ticket Title',
      description: 'Admin wrote this',
      position: 99,
    });
    expect(store.orgGrants.has(`org-2:${EXIT_TICKET_ASSIGNMENT_TYPE_ID}`)).toBe(
      true
    );
    expect(store.schoolGrants.size).toBe(0);
    expect(store.teacherGrants.size).toBe(0);
    expect(store.image).toMatchObject({ blob: 'x' });
  });

  test('attaches the fixture card when the type has none', async () => {
    const { prisma, store } = makePrisma({
      assignmentType: {
        id: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
        kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
      },
    });

    await bootstrapExitTicketAssignmentType(prisma as never, {
      organizationIds: ['org-1'],
      attachImageIfMissing: true,
    });

    const fixture = assignmentTypeImages.find(
      (row) => row.assignmentTypeId === EXIT_TICKET_ASSIGNMENT_TYPE_ID
    )!;
    expect(store.image).toMatchObject({
      assignmentTypeId: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
      contentType: fixture.contentType,
      altText: fixture.altText,
    });
    expect(
      (store.image!.blob as Buffer).equals(
        Buffer.from(fixture.blob.base64, 'base64')
      )
    ).toBe(true);
  });

  /**
   * The migration drew the first card into production. That card is the
   * repo's own, so when the fixture carries a new one the seed swaps it in;
   * a card an admin uploaded (the test above) is never touched.
   */
  test('on rerun swaps the bootstrap card for the current fixture card', async () => {
    const bootstrapCard = Buffer.from('bootstrap card bytes');
    EXIT_TICKET_RETIRED_ARTWORK_MD5S.push(
      createHash('md5').update(bootstrapCard).digest('hex')
    );
    try {
      const { prisma, store } = makePrisma({
        assignmentType: {
          id: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
          kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
        },
        image: {
          assignmentTypeId: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
          blob: bootstrapCard,
        },
      });

      await bootstrapExitTicketAssignmentType(prisma as never, {
        organizationIds: ['org-1'],
        attachImageIfMissing: true,
      });

      const fixture = assignmentTypeImages.find(
        (row) => row.assignmentTypeId === EXIT_TICKET_ASSIGNMENT_TYPE_ID
      )!;
      expect(store.image).toMatchObject({ altText: fixture.altText });
      expect(
        (store.image!.blob as Buffer).equals(
          Buffer.from(fixture.blob.base64, 'base64')
        )
      ).toBe(true);
    } finally {
      EXIT_TICKET_RETIRED_ARTWORK_MD5S.pop();
    }
  });

  test('retires the card the migration shipped', () => {
    expect(EXIT_TICKET_RETIRED_ARTWORK_MD5S).toContain(
      EXIT_TICKET_BOOTSTRAP_IMAGE_MD5
    );
  });
});
