import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { recordInternalPlatformWriteAudit } from '~/utils/internal-platform-auth.server';
import { createInternalAssignmentTypeModuleHandlers } from '~/utils/internal-assignment-type-module-writes.server';
const handlers = createInternalAssignmentTypeModuleHandlers({ db: prisma, auditRead: recordInternalPlatformWriteAudit });
export const loader = ({ request, params }: LoaderFunctionArgs) => handlers.detail(request, params.id, params.moduleId);
export const action = ({ request, params }: ActionFunctionArgs) => request.method === 'DELETE' ? handlers.deleteModule(request, params.id, params.moduleId) : handlers.updateModule(request, params.id, params.moduleId);
