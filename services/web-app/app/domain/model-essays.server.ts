import { prisma } from '~/utils/db.server';

export type ModelEssayFilters = {
  search?: string;
  essayType?: string[];
  part?: string[];
  topicCategory?: string[];
  gradeLevel?: number[];
  assignmentTypeId?: string;
  moduleId?: string;
};

export type ModelEssayListItem = {
  id: string;
  title: string;
  subtitle: string | null;
  essayType: string | null;
  part: string | null;
  topicCategory: string | null;
  gradeLevel: number | null;
  bodyPreview: string;
};

const PREVIEW_CHARS = 280;

function buildPreview(body: string): string {
  if (body.length <= PREVIEW_CHARS) return body;
  const slice = body.slice(0, PREVIEW_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + '…';
}

// Library query — returns only published (non-hidden) essays. Filters are
// AND across facets, OR within each facet, matching the daily-pages prompt
// library pattern referenced in the spec.
export async function listPublishedModelEssays(
  filters: ModelEssayFilters = {}
): Promise<ModelEssayListItem[]> {
  const where: Record<string, unknown> = { isHidden: false };

  if (filters.essayType?.length) {
    where.essayType = { in: filters.essayType };
  }
  if (filters.part?.length) {
    where.part = { in: filters.part };
  }
  if (filters.topicCategory?.length) {
    where.topicCategory = { in: filters.topicCategory };
  }
  if (filters.gradeLevel?.length) {
    where.gradeLevel = { in: filters.gradeLevel };
  }
  if (filters.assignmentTypeId) {
    where.assignmentTypeId = filters.assignmentTypeId;
  }
  if (filters.moduleId) {
    where.moduleId = filters.moduleId;
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { subtitle: { contains: q, mode: 'insensitive' } },
      { body: { contains: q, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.modelEssay.findMany({
    where: where as any,
    orderBy: [{ part: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      subtitle: true,
      essayType: true,
      part: true,
      topicCategory: true,
      gradeLevel: true,
      body: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    essayType: row.essayType,
    part: row.part,
    topicCategory: row.topicCategory,
    gradeLevel: row.gradeLevel,
    bodyPreview: buildPreview(row.body),
  }));
}

export async function getPublishedModelEssayById(id: string) {
  return prisma.modelEssay.findFirst({
    where: { id, isHidden: false },
    select: {
      id: true,
      title: true,
      subtitle: true,
      body: true,
      essayType: true,
      part: true,
      topicCategory: true,
      gradeLevel: true,
    },
  });
}

// Facet aggregation for the filter chips. Counts published essays only.
export async function getModelEssayFacets() {
  const rows = await prisma.modelEssay.findMany({
    where: { isHidden: false },
    select: { essayType: true, part: true, topicCategory: true, gradeLevel: true },
  });

  const collect = (key: keyof (typeof rows)[number]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = row[key];
      if (v === null || v === undefined) continue;
      const k = String(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  };

  return {
    essayType: collect('essayType'),
    part: collect('part'),
    topicCategory: collect('topicCategory'),
    gradeLevel: collect('gradeLevel'),
    total: rows.length,
  };
}
