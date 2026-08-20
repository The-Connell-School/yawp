import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  rubric: {
    findMany: mock(),
    create: mock(),
    update: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { seedStarterRubrics } = await import('./rubric-library.server');
const { STARTER_RUBRICS } = await import('./starter-rubrics');

describe('seedStarterRubrics', () => {
  beforeEach(() => {
    prisma.rubric.findMany.mockReset();
    prisma.rubric.create.mockReset();
    prisma.rubric.update.mockReset();
    prisma.rubric.create.mockResolvedValue({});
    prisma.rubric.update.mockResolvedValue({});
  });

  test('repairs a drifted protected rubric to the production definition', async () => {
    prisma.rubric.findMany.mockResolvedValue([
      {
        id: 'thesis-1',
        name: 'thesis-driven-essay',
        title: 'Changed thesis',
        schemaJson: {
          name: 'thesis-driven-essay',
          title: 'Changed thesis',
          scoringScale: {
            type: 'weighted_percent',
            minScore: 0,
            maxScore: 100,
          },
          rubric: {
            categories: [
              {
                key: 'changed',
                label: 'Changed',
                description: 'Changed behavior.',
                weight: 1,
              },
            ],
          },
        },
      },
    ]);

    await seedStarterRubrics();

    expect(prisma.rubric.update).toHaveBeenCalledWith({
      where: { id: 'thesis-1' },
      data: {
        title: STARTER_RUBRICS[0].title,
        schemaJson: STARTER_RUBRICS[0],
      },
    });
    expect(prisma.rubric.create).toHaveBeenCalledWith({
      data: {
        name: STARTER_RUBRICS[1].name,
        title: STARTER_RUBRICS[1].title,
        schemaJson: STARTER_RUBRICS[1],
      },
    });
  });

  test('does not write when all protected rubrics already match their definitions', async () => {
    prisma.rubric.findMany.mockResolvedValue(
      STARTER_RUBRICS.map((schema, index) => ({
        id: `rubric-${index}`,
        name: schema.name,
        title: schema.title,
        schemaJson: schema,
      }))
    );

    await seedStarterRubrics();

    expect(prisma.rubric.create).not.toHaveBeenCalled();
    expect(prisma.rubric.update).not.toHaveBeenCalled();
  });
});
