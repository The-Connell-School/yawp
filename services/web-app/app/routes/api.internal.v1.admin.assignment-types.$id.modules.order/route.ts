import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { recordInternalPlatformWriteAudit } from '~/utils/internal-platform-auth.server';
import { createInternalAssignmentTypeModuleHandlers } from '~/utils/internal-assignment-type-module-writes.server';
const handlers = createInternalAssignmentTypeModuleHandlers({ db: prisma, auditRead: recordInternalPlatformWriteAudit });
export const action = ({ request, params }: ActionFunctionArgs) => handlers.reorderModules(request, params.id);
export const loader = ({ request, params }: LoaderFunctionArgs) => handlers.reorderModules(request, params.id);
