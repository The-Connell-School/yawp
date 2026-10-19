import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { recordInternalPlatformWriteAudit } from '~/utils/internal-platform-auth.server';
import { createInternalAssignmentTypeHandlers } from '~/utils/internal-assignment-types.server';
import { createInternalAssignmentTypeWriteHandlers } from '~/utils/internal-assignment-type-writes.server';

const handlers = createInternalAssignmentTypeHandlers({
  db: prisma,
  auditRead: recordInternalPlatformWriteAudit,
});

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  handlers.detail(request, params.id);

const writes = createInternalAssignmentTypeWriteHandlers({ db: prisma });
export const action = ({ request, params }: ActionFunctionArgs) =>
  writes.update(request, params.id);
