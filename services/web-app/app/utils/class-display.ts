/**
 * The subset of class fields the display helpers read. Callers routinely pass a
 * whole class record (loader payload, Prisma row, card view-model), so extra
 * properties are permitted rather than forcing every call site to project.
 */
export type ClassDisplayFields = {
  grade?: string | number | null;
  period?: string | number | null;
  title?: string | null;
  [key: string]: unknown;
};

function formatGradePart(
  grade: string | number | null | undefined
): string | null {
  if (grade === null || grade === undefined || String(grade).trim() === '') {
    return null;
  }
  return `Grade ${grade}`;
}

function formatPeriodPart(
  period: string | number | null | undefined
): string | null {
  if (period === null || period === undefined || String(period).trim() === '') {
    return null;
  }
  return `Period ${period}`;
}

export function formatClassGradePeriod(
  klass: ClassDisplayFields
): string | null {
  const parts = [
    formatGradePart(klass.grade),
    formatPeriodPart(klass.period),
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(' • ') : null;
}

export function getClassCardHeading(klass: ClassDisplayFields): {
  title: string;
  subtitle: string | null;
} {
  const customTitle = klass.title?.trim();
  const gradePeriod = formatClassGradePeriod(klass);

  if (customTitle) {
    return {
      title: customTitle,
      subtitle: gradePeriod,
    };
  }

  return {
    title: gradePeriod ?? 'Untitled Class',
    subtitle: null,
  };
}

export function formatClassCardTitle(klass: ClassDisplayFields): string {
  return getClassCardHeading(klass).title;
}

export function formatClassCardSubtitle(
  klass: ClassDisplayFields
): string | null {
  return getClassCardHeading(klass).subtitle;
}

export function formatClassLabel(klass: ClassDisplayFields): string {
  const title = klass.title?.trim();
  const gradePeriod = formatClassGradePeriod(klass);

  if (title && gradePeriod) return `${title} · ${gradePeriod}`;
  if (title) return title;
  return gradePeriod ?? 'Untitled Class';
}
