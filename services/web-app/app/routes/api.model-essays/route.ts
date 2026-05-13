import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';
import { isEssayExamplesEnabled } from '~/utils/feature-flags.server';

// Read-only listing endpoint backing the YAWP! Library and the module-page gallery.
// V1: returns non-hidden model essays, filterable by the facets defined in the spec.
// UI surfaces (library page, module gallery) ship in follow-up PRs.

const FACETS = ['rhetoricalMove', 'difficulty', 'part', 'topicCategory'] as const;

function parseMulti(url: URL, key: string): string[] {
  const all = url.searchParams.getAll(key);
  return all.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!(await isEssayExamplesEnabled())) {
    return dataResponse({ essays: [], facets: {} }, { status: 200 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('q')?.trim() ?? '';
  const gradeLevels = parseMulti(url, 'gradeLevel')
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
  const assignmentTypeIds = parseMulti(url, 'assignmentTypeId');
  const filters: Record<string, string[]> = {};
  for (const facet of FACETS) {
    const values = parseMulti(url, facet);
    if (values.length) filters[facet] = values;
  }

  const where = {
    isHidden: false,
    ...(gradeLevels.length ? { gradeLevel: { in: gradeLevels } } : {}),
    ...(assignmentTypeIds.length
      ? { assignmentTypeId: { in: assignmentTypeIds } }
      : {}),
    ...Object.fromEntries(
      Object.entries(filters).map(([facet, values]) => [facet, { in: values }])
    ),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { body: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const essays = await prisma.modelEssay.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      subtitle: true,
      body: true,
      rhetoricalMove: true,
      topicCategory: true,
      part: true,
      difficulty: true,
      gradeLevel: true,
      assignmentTypeId: true,
    },
  });

  return dataResponse({ essays, facets: filters });
}
