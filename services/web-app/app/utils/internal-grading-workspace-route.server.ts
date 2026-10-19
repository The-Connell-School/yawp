import { prisma } from './db.server';
import { recordInternalPlatformWriteAudit } from './internal-platform-auth.server';
import { createInternalGradingWorkspaceHandlers } from './internal-grading-workspace.server';
export const gradingWorkspaceHandlers = createInternalGradingWorkspaceHandlers({
  db: prisma,
  auditRead: recordInternalPlatformWriteAudit,
});
