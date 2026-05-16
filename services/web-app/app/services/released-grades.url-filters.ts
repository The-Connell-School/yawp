import type { PileFilters } from './released-grades.server';

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseInteger(s: string | null): number | undefined {
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function parseUrlFilters(url: URL): PileFilters {
  const out: PileFilters = {};
  const releasedFrom = parseDate(url.searchParams.get('from'));
  const releasedTo = parseDate(url.searchParams.get('to'));
  if (releasedFrom) out.releasedFrom = releasedFrom;
  if (releasedTo) out.releasedTo = releasedTo;
  const students = url.searchParams.get('students');
  if (students) {
    const ids = students
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) out.studentProfileIds = ids;
  }
  const minGrade = parseInteger(url.searchParams.get('minGrade'));
  const maxGrade = parseInteger(url.searchParams.get('maxGrade'));
  if (minGrade != null) out.minGrade = minGrade;
  if (maxGrade != null) out.maxGrade = maxGrade;
  return out;
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function filtersToSearchParams(
  filters: PileFilters
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.releasedFrom) params.set('from', dateString(filters.releasedFrom));
  if (filters.releasedTo) params.set('to', dateString(filters.releasedTo));
  if (filters.studentProfileIds?.length)
    params.set('students', filters.studentProfileIds.join(','));
  if (filters.minGrade != null) params.set('minGrade', String(filters.minGrade));
  if (filters.maxGrade != null) params.set('maxGrade', String(filters.maxGrade));
  return params;
}
