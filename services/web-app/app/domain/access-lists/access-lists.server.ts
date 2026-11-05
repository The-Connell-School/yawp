import { normalizeEmail } from '~/utils/normalize-email';
import { prisma } from '~/utils/db.server';
import { writeAdminConfigAudit } from '~/domain/admin-config/admin-config-audit.server';

export type AccessListActor = {
  actorUserId?: string | null;
  actorEmail: string;
  source: 'web_admin' | 'internal_api';
  reason?: string | null;
};

export async function isOnAccessList(
  listKey: string,
  {
    userId,
    email,
  }: {
    userId?: string | null;
    email?: string | null;
  }
): Promise<boolean> {
  if (userId) {
    const byUser = await prisma.accessListEntry.findFirst({
      where: { listKey, userId },
      select: { id: true },
    });
    if (byUser) return true;
  }
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const byEmail = await prisma.accessListEntry.findUnique({
    where: { listKey_email: { listKey, email: normalized } },
    select: { id: true },
  });
  return Boolean(byEmail);
}

export async function listAccessList(listKey: string) {
  return prisma.accessListEntry.findMany({
    where: { listKey },
    orderBy: [{ email: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      listKey: true,
      userId: true,
      email: true,
      note: true,
      createdAt: true,
      createdByUserId: true,
    },
  });
}

export async function addAccessListEntry(
  listKey: string,
  input: {
    email: string;
    userId?: string | null;
    note?: string | null;
  },
  actor: AccessListActor
) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.accessListEntry.findUnique({
    where: { listKey_email: { listKey, email } },
  });
  const row = await prisma.accessListEntry.upsert({
    where: { listKey_email: { listKey, email } },
    create: {
      listKey,
      email,
      userId: input.userId ?? null,
      note: input.note ?? null,
      createdByUserId: actor.actorUserId ?? null,
    },
    update: {
      userId: input.userId ?? undefined,
      note: input.note ?? undefined,
    },
    select: {
      id: true,
      listKey: true,
      userId: true,
      email: true,
      note: true,
      createdAt: true,
      createdByUserId: true,
    },
  });
  await writeAdminConfigAudit({
    actorUserId: actor.actorUserId,
    actorEmail: actor.actorEmail,
    source: actor.source,
    entityType: 'access_list',
    entityKey: listKey,
    action: 'add',
    before: existing
      ? {
          email: existing.email,
          userId: existing.userId,
          note: existing.note,
        }
      : null,
    after: {
      email: row.email,
      userId: row.userId,
      note: row.note,
    },
    reason: actor.reason,
  });
  return row;
}

export async function removeAccessListEntry(
  listKey: string,
  emailInput: string,
  actor: AccessListActor
) {
  const email = normalizeEmail(emailInput);
  const existing = await prisma.accessListEntry.findUnique({
    where: { listKey_email: { listKey, email } },
  });
  if (!existing) return { removed: false as const };
  await prisma.accessListEntry.delete({
    where: { listKey_email: { listKey, email } },
  });
  await writeAdminConfigAudit({
    actorUserId: actor.actorUserId,
    actorEmail: actor.actorEmail,
    source: actor.source,
    entityType: 'access_list',
    entityKey: listKey,
    action: 'remove',
    before: {
      email: existing.email,
      userId: existing.userId,
      note: existing.note,
    },
    after: null,
    reason: actor.reason,
  });
  return { removed: true as const, entry: existing };
}
