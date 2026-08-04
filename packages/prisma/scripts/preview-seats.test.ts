import { describe, expect, mock, test } from 'bun:test';
import {
  buildPreviewSeatDefinitions,
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
        world.organizations[where.id]
          ? { id: where.id }
          : null,
      ),
    },
    $transaction: async <T>(work: (transaction: typeof client) => Promise<T>) => {
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
  test('defaults to Brian, Bryant, then four generic isolated organizations', () => {
    const seats = buildPreviewSeatDefinitions();

    expect(seats).toHaveLength(6);
    expect(seats.map((seat) => seat.label)).toEqual([
      'Brian Connell',
      'Bryant Brock',
      'Seat 3',
      'Seat 4',
      'Seat 5',
      'Seat 6',
    ]);
    expect(seats[0]).toMatchObject({
      organizationId: 'local-dev-org',
      organizationName: 'Yawp Local Dev',
      adoptExisting: true,
    });
    expect(new Set(seats.map((seat) => seat.organizationId)).size).toBe(6);
  });

  test('gives every seeded seat unique users and school codes', () => {
    const seats = buildPreviewSeatDefinitions();
    const emails = seats.flatMap((seat) => seat.personas.map((persona) => persona.email));
    const schoolCodes = seats.flatMap((seat) => seat.schoolCodes);

    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(schoolCodes).size).toBe(schoolCodes.length);
  });

  test('pins new worlds to the committed template instead of existing seat drift', async () => {
    const source = await Bun.file(
      new URL('./preview-seats.ts', import.meta.url),
    ).text();

    expect(source).toContain('loadProdFidelityBundle');
    expect(source).toContain('assignmentTypeIds');
    expect(source).toContain('teacherTrainingIds');
    expect(source).not.toContain("assignmentType.findMany({\n    select");
  });
});

describe('class insights seat enablement', () => {
  test('runs the per-organization update for every newly created seat', async () => {
    const updateMany = mock(async () => ({ count: 1 }));
    const organizationIds = buildPreviewSeatDefinitions(3).map(
      (seat) => seat.organizationId,
    );

    const results = await enableClassInsightsForOrganizations(
      { organization: { updateMany } } as never,
      organizationIds,
    );

    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany.mock.calls.map(([args]) => args.where.id)).toEqual(
      organizationIds,
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
      fixture.createSeat,
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
      fixture.createSeat,
    );

    expect(fixture.writes).toEqual(['preview-seat-4']);
    const after = fixture.getWorld();
    expect(after.organizations['local-dev-org']).toEqual(
      before.organizations['local-dev-org'],
    );
    expect(after.organizations['preview-seat-2']).toEqual(
      before.organizations['preview-seat-2'],
    );
    expect(after.organizations['preview-seat-3']).toEqual(
      before.organizations['preview-seat-3'],
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
      seat: PreviewSeatDefinition,
    ) => {
      await fixture.createSeat(transaction, seat);
      throw new Error('synthetic template failed');
    };

    await expect(
      ensurePreviewSeats(
        fixture.client as never,
        buildPreviewSeatDefinitions(2),
        failingCreate,
      ),
    ).rejects.toThrow('synthetic template failed');

    expect(fixture.getWorld()).toEqual(brianWorld);
    expect(fixture.writes).toEqual([]);
  });

  test('refuses to synthesize Brian’s adopted seat when local-dev-org is absent', async () => {
    const fixture = fakePrisma({ organizations: {} });

    await expect(
      ensurePreviewSeats(
        fixture.client as never,
        buildPreviewSeatDefinitions(1),
        fixture.createSeat,
      ),
    ).rejects.toThrow('Brian Connell seat requires existing organization local-dev-org');
    expect(fixture.writes).toEqual([]);
  });
});
