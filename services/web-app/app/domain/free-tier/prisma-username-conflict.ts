import { Prisma } from '@app/prisma';

function uniqueTargetFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map(String);
  }
  if (typeof target === 'string') {
    return [target];
  }
  return [];
}

export function isPrismaUniqueViolation(
  error: unknown,
  field?: string
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  if (!field) return true;
  const fields = uniqueTargetFields(error);
  return fields.some((f) => f.includes(field));
}

export function isUsernameUniqueViolation(error: unknown): boolean {
  return isPrismaUniqueViolation(error, 'username');
}
