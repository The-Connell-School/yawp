import type { PrismaClient } from '../../generated/prisma';

/**
 * The shared "YAWP! team" account the launch questions are posted from, so
 * they read as coming from the team rather than one person. It has no
 * password and an address that cannot receive mail (.invalid), so nobody can
 * sign in as it or reset its password. It is an admin only so the Lounge
 * shows it as the YAWP! team.
 */
export const LOUNGE_TEAM_ACCOUNT = {
  email: 'yawp-team@lounge.invalid',
  name: 'YAWP! team',
} as const;

type UserPrisma = Pick<PrismaClient, 'user'>;

export async function findLoungeTeamAccount(prisma: UserPrisma) {
  return prisma.user.findUnique({ where: { email: LOUNGE_TEAM_ACCOUNT.email }, select: { id: true } });
}

/** Create-only: an existing account (and any rename) is left alone. */
export async function ensureLoungeTeamAccount(prisma: UserPrisma): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { email: LOUNGE_TEAM_ACCOUNT.email },
    create: { ...LOUNGE_TEAM_ACCOUNT, isAdmin: true },
    update: {},
    select: { id: true },
  });
}
