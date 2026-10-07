import { isPrismaUniqueViolation } from '~/utils/prisma-unique-violation';

export function isUsernameUniqueViolation(error: unknown): boolean {
  return isPrismaUniqueViolation(error, 'username');
}

export { isPrismaUniqueViolation } from '~/utils/prisma-unique-violation';
