import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

export type AdminConfigAuditSource = 'web_admin' | 'internal_api';
export type AdminConfigAuditEntityType = 'feature_flag' | 'access_list';
export type AdminConfigAuditAction = 'set' | 'add' | 'remove';

export type WriteAdminConfigAuditInput = {
  actorUserId?: string | null;
  actorEmail: string;
  source: AdminConfigAuditSource;
  entityType: AdminConfigAuditEntityType;
  entityKey: string;
  action: AdminConfigAuditAction;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
  client?: Pick<typeof prisma, 'adminConfigAudit'>;
};

export async function writeAdminConfigAudit({
  client = prisma,
  ...input
}: WriteAdminConfigAuditInput) {
  await client.adminConfigAudit.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail,
      source: input.source,
      entityType: input.entityType,
      entityKey: input.entityKey,
      action: input.action,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      reason: input.reason ?? null,
    },
  });
}
