export function prismaUniqueConstraintTargets(error: unknown): string[] | null {
  if (!error || typeof error !== 'object') return null;

  const prismaError = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown } };
      };
    };
  };
  if (prismaError.code !== 'P2002') return null;

  const values = [
    prismaError.meta?.target,
    prismaError.meta?.driverAdapterError?.cause?.constraint?.fields,
  ];

  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
  });
}

export function uniqueConstraintIncludes(
  targets: readonly string[],
  field: string
): boolean {
  return targets.some((target) =>
    target
      .replace(/[()"']/g, '')
      .split(',')
      .some((part) => part.trim() === field)
  );
}

export function isPrismaUniqueViolation(error: unknown, field?: string): boolean {
  const targets = prismaUniqueConstraintTargets(error);
  if (!targets?.length) return false;
  if (!field) return true;
  return uniqueConstraintIncludes(targets, field);
}
