import { prisma } from './db.server';
import { createAdminAuditHandlers } from './internal-admin-audit.server';
export const adminAudit = createAdminAuditHandlers({ db: prisma });
