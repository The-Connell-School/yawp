import { describe, expect, mock, test } from 'bun:test';
import {
  backfillLegacyPreviewSeatCodes,
  buildPreviewSeatDefinition,
  buildPreviewSeatDefinitions,
  createRuntimePreviewSeat,
  enableWritingPracticeForPreviewOrganizations,
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

describe('writing practice preview enablement', () => {
  test('repairs retained configured seats without touching other organizations', async () => {
    const updateMany = mock(async () => ({ count: 2 }));

    const result = await enableWritingPracticeForPreviewOrganizations(
      { organization: { updateMany } } as never,
      ['local-dev-org', 'preview-seat-2', 'local-dev-org']
    );

    expect(result).toEqual({ count: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['local-dev-org', 'preview-seat-2'] },
        writingPracticeEnabled: false,
      },
      data: { writingPracticeEnabled: true },
    });
  });

  test('runs on every preview-seat seed pass, including retained databases', async () => {
    const seedSource = await Bun.file(
      new URL('./seed-preview-seats.ts', import.meta.url)
    ).text();

    expect(seedSource).toContain(
      'enableWritingPracticeForPreviewOrganizations'
    );
    expect(seedSource).toContain(
      'seats.map(({ organizationId }) => organizationId)'
    );
  });

  test('preview planner QA seed failures are non-fatal inside preview seat bootstrap', async () => {
    const seedSource = await Bun.file(
      new URL('./seed-preview-seats.ts', import.meta.url)
    ).text();

    expect(seedSource).toContain('preview planner QA seed failed (non-fatal)');
    expect(seedSource).toContain('try {');
    expect(seedSource).toContain('seedPreviewPlannerQa');
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

/**
 * Topping up an existing seat, and the line it must not cross.
 *
 * A per-PR preview keeps its database between deploys, so data a branch adds after
 * that database was created has no other way in — without this, work like a new
 * demo class is committed, tested, and invisible on the preview it exists for.
 *
 * The demo box is the opposite case: long-lived, someone demos from it, and its
 * whole contract is that redeploying ships code and not data.
 *
 * The two are told apart by the database name, because that is the only signal
 * that reaches this file. `scripts/preview/` is checked out from the default
 * branch so a pull request cannot change what runs on the shared preview host,
 * which means an env var set there is inert for the branch that added it.
 */
describe('topping up an existing preview seat', () => {
  const withEnv = async (env: Record<string, string | undefined>) => {
    const fixture = fakePrisma(brianWorld);
    const toppedUp: string[] = [];
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(env)) {
      previous[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      await ensurePreviewSeats(
        fixture.client as never,
        buildPreviewSeatDefinitions(1),
        fixture.createSeat,
        async (_transaction, seat) => {
          toppedUp.push(seat.organizationId);
        }
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    return { fixture, toppedUp };
  };

  const PR_DB =
    'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_267';
  const DEMO_DB =
    'postgresql://postgres:postgres@preview-postgres:5432/yawp_demo';

  test('tops up a seat on a per-PR preview', async () => {
    const { fixture, toppedUp } = await withEnv({
      DATABASE_URL: PR_DB,
      PREVIEW_SEAT_TOP_UP: undefined,
    });

    expect(toppedUp).toEqual(['local-dev-org']);
    // Still not a create: the organization is adopted, not rebuilt.
    expect(fixture.writes).toEqual([]);
  });

  test('leaves the demo box alone', async () => {
    // The one environment that must not be surprised. Nothing about a redeploy
    // may touch its data.
    const { fixture, toppedUp } = await withEnv({
      DATABASE_URL: DEMO_DB,
      PREVIEW_SEAT_TOP_UP: undefined,
    });

    expect(toppedUp).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });

  test('does not mistake a database that merely mentions a PR for one', async () => {
    // `yawp_pr_` has to be the database, not a substring of a host or a password,
    // or a demo box behind a host with that name would start being written to.
    const { toppedUp } = await withEnv({
      DATABASE_URL:
        'postgresql://yawp_pr_267:pw@yawp_pr_267.example:5432/yawp_demo',
      PREVIEW_SEAT_TOP_UP: undefined,
    });

    expect(toppedUp).toEqual([]);
  });

  test('an explicit flag overrides the database name either way', async () => {
    // So the control plane can turn this off for a preview, or on for an
    // environment whose name does not say what it is, without a code change.
    const off = await withEnv({
      DATABASE_URL: PR_DB,
      PREVIEW_SEAT_TOP_UP: '0',
    });
    expect(off.toppedUp).toEqual([]);

    const on = await withEnv({
      DATABASE_URL: DEMO_DB,
      PREVIEW_SEAT_TOP_UP: '1',
    });
    expect(on.toppedUp).toEqual(['local-dev-org']);
  });

  test('no database url at all tops up nothing', async () => {
    const { toppedUp } = await withEnv({
      DATABASE_URL: undefined,
      PREVIEW_SEAT_TOP_UP: undefined,
    });

    expect(toppedUp).toEqual([]);
  });
});

describe('legacy preview seat code backfill', () => {
  test('skips Master, reconciles configured codes, and never creates missing organizations', async () => {
    const rows: Record<string, string | null> = {
      'local-dev-org': null,
      'preview-seat-2': null,
      'preview-seat-3': 'steady-wren-3333',
    };
    const update = mock(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { previewSeatCode: string };
      }) => {
        if (!(where.id in rows)) throw new Error('missing org');
        rows[where.id] = data.previewSeatCode;
      }
    );
    const findUnique = mock(async ({ where }: { where: { id: string } }) =>
      where.id in rows
        ? { id: where.id, previewSeatCode: rows[where.id] }
        : null
    );

    const result = await backfillLegacyPreviewSeatCodes(
      { organization: { update, findUnique } } as never,
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
      'preview-seat-3': 'ready-robin-2222',
    });
    expect(result.map(({ status }) => status)).toEqual([
      'master',
      'backfilled',
      'backfilled',
      'missing',
    ]);
    expect(update).toHaveBeenCalledTimes(2);
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
