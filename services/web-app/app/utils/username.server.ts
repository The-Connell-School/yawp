import { prisma } from './db.server';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  normalizeUsername,
  validateUsername,
} from './username';

export {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  RESERVED_USERNAMES,
  type UsernameValidationResult,
  normalizeUsername,
  validateUsername,
} from './username';

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  const existing = await prisma.user.findFirst({
    where: { username: normalized },
    select: { id: true },
  });
  return !existing;
}

export async function suggestAvailableUsernames(
  baseRaw: string,
  limit = 5
): Promise<string[]> {
  const base = normalizeUsername(baseRaw).replace(/[^a-z0-9._-]/g, '');
  const seed =
    base.length >= USERNAME_MIN_LENGTH
      ? base.slice(0, USERNAME_MAX_LENGTH)
      : `user${base}`.slice(0, USERNAME_MAX_LENGTH);

  const candidates: string[] = [];
  const pushCandidate = (value: string) => {
    const validated = validateUsername(value);
    if (validated.ok && !candidates.includes(validated.username)) {
      candidates.push(validated.username);
    }
  };

  pushCandidate(seed);
  for (let i = 0; i < 20 && candidates.length < limit * 3; i++) {
    pushCandidate(`${seed}${i}`.slice(0, USERNAME_MAX_LENGTH));
    pushCandidate(`${seed}_${i}`.slice(0, USERNAME_MAX_LENGTH));
  }

  const available: string[] = [];
  for (const candidate of candidates) {
    if (available.length >= limit) break;
    if (await isUsernameAvailable(candidate)) {
      available.push(candidate);
    }
  }
  return available;
}
