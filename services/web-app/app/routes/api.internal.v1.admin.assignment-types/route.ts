import type { LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { recordInternalPlatformWriteAudit } from '~/utils/internal-platform-auth.server';
import { createInternalAssignmentTypeHandlers } from '~/utils/internal-assignment-types.server';

const handlers = createInternalAssignmentTypeHandlers({
  db: prisma,
  auditRead: recordInternalPlatformWriteAudit,
});

export const loader = ({ request }: LoaderFunctionArgs) => handlers.list(request);

