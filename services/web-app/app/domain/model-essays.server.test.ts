import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  modelEssay: {
    findMany: mock(),
    findFirst: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  listPublishedModelEssays,
  getPublishedModelEssayById,
  getModelEssayFacets,
} = await import('./model-essays.server');

describe('listPublishedModelEssays', () => {
  beforeEach(() => {
    prisma.modelEssay.findMany.mockReset();
  });

  test('excludes hidden essays by default', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([]);
    await listPublishedModelEssays();
    const call = prisma.modelEssay.findMany.mock.calls[0][0];
    expect(call.where.isHidden).toBe(false);
  });

  test('combines facet filters with AND across facets, IN within a facet', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([]);
    await listPublishedModelEssays({
      essayType: ['The Reframe', 'The Close Reading'],
      part: ['Part One: School'],
      gradeLevel: [11, 12],
    });
    const where = prisma.modelEssay.findMany.mock.calls[0][0].where;
    expect(where.essayType).toEqual({ in: ['The Reframe', 'The Close Reading'] });
    expect(where.part).toEqual({ in: ['Part One: School'] });
    expect(where.gradeLevel).toEqual({ in: [11, 12] });
  });

  test('search builds a case-insensitive OR across title/subtitle/body', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([]);
    await listPublishedModelEssays({ search: '  cafeteria  ' });
    const where = prisma.modelEssay.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { title: { contains: 'cafeteria', mode: 'insensitive' } },
      { subtitle: { contains: 'cafeteria', mode: 'insensitive' } },
      { body: { contains: 'cafeteria', mode: 'insensitive' } },
    ]);
  });

  test('blank search does not add OR clause', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([]);
    await listPublishedModelEssays({ search: '   ' });
    const where = prisma.modelEssay.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  test('builds a truncated body preview ending at a word boundary', async () => {
    const longBody = 'word '.repeat(200).trim();
    prisma.modelEssay.findMany.mockResolvedValueOnce([
      {
        id: 'e1',
        title: 't',
        subtitle: null,
        essayType: null,
        part: null,
        topicCategory: null,
        gradeLevel: null,
        body: longBody,
      },
    ]);
    const [item] = await listPublishedModelEssays();
    expect(item.bodyPreview.endsWith('…')).toBe(true);
    expect(item.bodyPreview.length).toBeLessThanOrEqual(281);
    // No trailing partial word before the ellipsis.
    const beforeEllipsis = item.bodyPreview.slice(0, -1);
    expect(beforeEllipsis.endsWith(' ')).toBe(false);
    expect(beforeEllipsis.endsWith('word')).toBe(true);
  });

  test('short bodies are returned untruncated', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([
      {
        id: 'e1',
        title: 't',
        subtitle: null,
        essayType: null,
        part: null,
        topicCategory: null,
        gradeLevel: null,
        body: 'a tight essay.',
      },
    ]);
    const [item] = await listPublishedModelEssays();
    expect(item.bodyPreview).toBe('a tight essay.');
  });
});

describe('getPublishedModelEssayById', () => {
  beforeEach(() => {
    prisma.modelEssay.findFirst.mockReset();
  });

  test('refuses to return hidden essays', async () => {
    prisma.modelEssay.findFirst.mockResolvedValueOnce(null);
    const result = await getPublishedModelEssayById('hidden-id');
    expect(result).toBeNull();
    const where = prisma.modelEssay.findFirst.mock.calls[0][0].where;
    expect(where.isHidden).toBe(false);
    expect(where.id).toBe('hidden-id');
  });
});

describe('getModelEssayFacets', () => {
  beforeEach(() => {
    prisma.modelEssay.findMany.mockReset();
  });

  test('counts published essays grouped by facet, ignoring nulls', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([
      { essayType: 'The Reframe', part: 'Part One: School', topicCategory: 'X', gradeLevel: 11 },
      { essayType: 'The Reframe', part: 'Part One: School', topicCategory: 'X', gradeLevel: null },
      { essayType: 'The Close Reading', part: 'Part Two', topicCategory: null, gradeLevel: 12 },
    ]);
    const facets = await getModelEssayFacets();
    expect(facets.total).toBe(3);
    expect(facets.essayType).toEqual([
      { value: 'The Close Reading', count: 1 },
      { value: 'The Reframe', count: 2 },
    ]);
    expect(facets.gradeLevel).toEqual([
      { value: '11', count: 1 },
      { value: '12', count: 1 },
    ]);
    expect(facets.topicCategory).toEqual([{ value: 'X', count: 2 }]);
  });

  test('queries only non-hidden essays', async () => {
    prisma.modelEssay.findMany.mockResolvedValueOnce([]);
    await getModelEssayFacets();
    const where = prisma.modelEssay.findMany.mock.calls[0][0].where;
    expect(where.isHidden).toBe(false);
  });
});
