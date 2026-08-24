import { describe, expect, mock, test } from 'bun:test';
import {
  backfillLegacyPreviewSeatCodes,
  buildPreviewSeatDefinition,
  buildPreviewSeatDefinitions,
  createPreviewSeat,
  createRuntimePreviewSeat,
  ensurePreviewSeats,
  type PreviewSeatDefinition,
} from './preview-seats';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';

type World = {
  organizations: Record<
    string,
    { name: string; documents: string[]; classInsightsEnabled: boolean }
  >;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fakePrisma(initial: World) {
  let world = clone(initial);
  const writes: string[] = [];

  const client = {
    organization: {
      findUnique: mock(async ({ where }: { where: { id: string } }) =>
        world.organizations[where.id] ? { id: where.id } : null
      ),
    },
    $transaction: async <T>(
      work: (transaction: typeof client) => Promise<T>
    ) => {
      const before = clone(world);
      const writeCount = writes.length;
      try {
        return await work(client);
      } catch (error) {
        world = before;
        writes.splice(writeCount);
        throw error;
      }
    },
  };

  return {
    client,
    createSeat: async (_transaction: unknown, seat: PreviewSeatDefinition) => {
      writes.push(seat.organizationId);
      world.organizations[seat.organizationId] = {
        name: seat.organizationName,
        documents: ['template-document'],
        classInsightsEnabled: true,
      };
    },
    getWorld: () => clone(world),
    writes,
  };
}

const brianWorld: World = {
  organizations: {
    'local-dev-org': {
      name: 'Yawp Local Dev',
      documents: ['Brian custom prep', 'Brian diverged assignment'],
      classInsightsEnabled: true,
    },
  },
};

describe('preview seat definitions', () => {
  test('defaults to the one adopted Master organization', () => {
    const seats = buildPreviewSeatDefinitions();

    expect(seats).toHaveLength(1);
    expect(seats.map((seat) => seat.label)).toEqual(['Master']);
    expect(seats[0]).toMatchObject({
      organizationId: 'local-dev-org',
      organizationName: 'Yawp Local Dev',
      adoptExisting: true,
    });
    expect(new Set(seats.map((seat) => seat.organizationId)).size).toBe(1);
  });

  test('gives every seeded seat unique users and school codes', () => {
    const seats = buildPreviewSeatDefinitions(6);
    const emails = seats.flatMap((seat) =>
      seat.personas.map((persona) => persona.email)
    );
    const schoolCodes = seats.flatMap((seat) => seat.schoolCodes);

    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(schoolCodes).size).toBe(schoolCodes.length);
  });

  test('pins new worlds to the committed template instead of existing seat drift', async () => {
    const source = await Bun.file(
      new URL('./preview-seats.ts', import.meta.url)
    ).text();

    expect(source).toContain('loadProdFidelityBundle');
    expect(source).toContain('assignmentTypeIds');
    expect(source).toContain('teacherTrainingIds');
    expect(source).toContain('assignmentType.ownerOrgId == null');
    expect(source).toContain('seat.organizationId === LOCAL_DEV_ORG_ID');
    expect(source).not.toContain('assignmentType.findMany({\n    select');
  });
});

describe('class insights seat enablement', () => {
  test('runs the per-organization update for every newly created seat', async () => {
    const updateMany = mock(async () => ({ count: 1 }));
    const organizationIds = buildPreviewSeatDefinitions(3).map(
      (seat) => seat.organizationId
    );

    const results = await enableClassInsightsForOrganizations(
      { organization: { updateMany } } as never,
      organizationIds
    );

    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany.mock.calls.map(([args]) => args.where.id)).toEqual(
      organizationIds
    );
    expect(results.every((result) => result.enabled)).toBe(true);
  });
});

describe('create-only preview seat seeding', () => {
  test('reseeding existing seats performs zero writes and preserves divergence', async () => {
    const seats = buildPreviewSeatDefinitions(2);
    const fixture = fakePrisma({
      organizations: {
        ...brianWorld.organizations,
        'preview-seat-2': {
          name: 'Bryant renamed this world',
          documents: ['Bryant custom document'],
          classInsightsEnabled: false,
        },
      },
    });
    const before = fixture.getWorld();

    const result = await ensurePreviewSeats(
      fixture.client as never,
      seats,
      fixture.createSeat
    );

    expect(result).toEqual([
      { organizationId: 'local-dev-org', status: 'adopted' },
      { organizationId: 'preview-seat-2', status: 'existing' },
    ]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.getWorld()).toEqual(before);
  });

  test('adding N+1 creates only the new seat and leaves seats 1 through N untouched', async () => {
    const fixture = fakePrisma({
      organizations: {
        ...brianWorld.organizations,
        'preview-seat-2': {
          name: 'Bryant custom world',
          documents: ['custom-2'],
          classInsightsEnabled: true,
        },
        'preview-seat-3': {
          name: 'Seat 3 custom world',
          documents: ['custom-3'],
          classInsightsEnabled: false,
        },
      },
    });
    const before = fixture.getWorld();

    await ensurePreviewSeats(
      fixture.client as never,
      buildPreviewSeatDefinitions(4),
      fixture.createSeat
    );

    expect(fixture.writes).toEqual(['preview-seat-4']);
    const after = fixture.getWorld();
    expect(after.organizations['local-dev-org']).toEqual(
      before.organizations['local-dev-org']
    );
    expect(after.organizations['preview-seat-2']).toEqual(
      before.organizations['preview-seat-2']
    );
    expect(after.organizations['preview-seat-3']).toEqual(
      before.organizations['preview-seat-3']
    );
    expect(after.organizations['preview-seat-4']).toEqual({
      name: 'Yawp Preview - Seat 4',
      documents: ['template-document'],
      classInsightsEnabled: true,
    });
  });

  test('rolls back an incomplete seat so a later deploy can retry it', async () => {
    const fixture = fakePrisma(brianWorld);
    const failingCreate = async (
      transaction: unknown,
      seat: PreviewSeatDefinition
    ) => {
      await fixture.createSeat(transaction, seat);
      throw new Error('synthetic template failed');
    };

    await expect(
      ensurePreviewSeats(
        fixture.client as never,
        buildPreviewSeatDefinitions(2),
        failingCreate
      )
    ).rejects.toThrow('synthetic template failed');

    expect(fixture.getWorld()).toEqual(brianWorld);
    expect(fixture.writes).toEqual([]);
  });

  test('refuses to synthesize the adopted Master seat when local-dev-org is absent', async () => {
    const fixture = fakePrisma({ organizations: {} });

    await expect(
      ensurePreviewSeats(
        fixture.client as never,
        buildPreviewSeatDefinitions(1),
        fixture.createSeat
      )
    ).rejects.toThrow(
      'Master seat requires existing organization local-dev-org'
    );
    expect(fixture.writes).toEqual([]);
  });
});

describe('legacy preview seat code backfill', () => {
  test('skips Master, fills null codes only, and never creates missing organizations', async () => {
    const rows: Record<string, string | null> = {
      'local-dev-org': null,
      'preview-seat-2': null,
      'preview-seat-3': 'steady-wren-3333',
    };
    const updateMany = mock(
      async ({
        where,
        data,
      }: {
        where: { id: string; previewSeatCode: null };
        data: { previewSeatCode: string };
      }) => {
        if (!(where.id in rows) || rows[where.id] !== null) return { count: 0 };
        rows[where.id] = data.previewSeatCode;
        return { count: 1 };
      }
    );
    const findUnique = mock(async ({ where }: { where: { id: string } }) =>
      where.id in rows
        ? { id: where.id, previewSeatCode: rows[where.id] }
        : null
    );

    const result = await backfillLegacyPreviewSeatCodes(
      { organization: { updateMany, findUnique } } as never,
      [
        {
          code: 'brave-otter-4193',
          organizationId: 'local-dev-org',
          label: 'Master',
        },
        {
          code: 'calm-panda-8127',
          organizationId: 'preview-seat-2',
          label: 'Seat 2',
        },
        {
          code: 'ready-robin-2222',
          organizationId: 'preview-seat-3',
          label: 'Seat 3',
        },
        {
          code: 'warm-fox-4444',
          organizationId: 'preview-seat-4',
          label: 'Seat 4',
        },
      ]
    );

    expect(rows).toEqual({
      'local-dev-org': null,
      'preview-seat-2': 'calm-panda-8127',
      'preview-seat-3': 'steady-wren-3333',
    });
    expect(result.map(({ status }) => status)).toEqual([
      'master',
      'backfilled',
      'existing',
      'missing',
    ]);
    expect(updateMany).toHaveBeenCalledTimes(3);
  });
});

describe('preview seat pilot flags', () => {
  // Preview seats exist so people can try the pilot features. A seat created
  // with a rollout gate off silently hides the feature it was deployed to
  // demonstrate, and the symptom looks like the feature is broken rather than
  // switched off.
  test('turns the student revision flow on for a newly created seat', async () => {
    const created: Array<Record<string, unknown>> = [];
    const transaction = {
      organization: {
        create: mock(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
      },
      organizationAssignmentType: { createMany: mock(async () => ({})) },
      assignmentType: { findMany: mock(async () => []) },
    };

    await createPreviewSeat(transaction as never, {
      ...buildPreviewSeatDefinition(2, { previewSeatCode: 'calm-panda-8127' }),
    }).catch(() => {
      // The seed and class-insights steps need a real client; the organization
      // row is created before either of them and is all this test asserts on.
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: 'preview-seat-2',
      reporterEnabled: true,
      revisionFlowEnabled: true,
    });
  });
});

describe('runtime preview seat creation', () => {
  test('creates only the next seat and carries its unique code into the seed transaction', async () => {
    const existing = [
      { id: 'local-dev-org', previewSeatCode: null },
      { id: 'preview-seat-2', previewSeatCode: 'calm-panda-8127' },
    ];
    const created: PreviewSeatDefinition[] = [];
    const transaction = {
      organization: {
        findMany: mock(async () => existing),
      },
    };
    const prisma = {
      $transaction: async <T>(
        work: (client: typeof transaction) => Promise<T>
      ) => work(transaction),
    };

    const result = await createRuntimePreviewSeat(
      prisma as never,
      {
        reservedCodes: ['brave-otter-4193'],
        generateCode: () => 'sunny-fox-2468',
      },
      async (_client, seat) => {
        created.push(seat);
      }
    );

    expect(created).toEqual([
      buildPreviewSeatDefinition(3, {
        previewSeatCode: 'sunny-fox-2468',
      }),
    ]);
    expect(result).toEqual({
      organizationId: 'preview-seat-3',
      label: 'Seat 3',
      organizationName: 'Yawp Preview - Seat 3',
      previewSeatCode: 'sunny-fox-2468',
    });
  });
});
