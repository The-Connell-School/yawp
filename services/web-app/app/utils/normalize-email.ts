export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Escape `\`, `%`, and `_` for Prisma `equals` + `mode: 'insensitive'` (ILIKE). */
export function escapeForPrismaCaseInsensitiveEquals(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}
