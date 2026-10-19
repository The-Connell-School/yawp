import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { recordInternalPlatformWriteAudit } from '~/utils/internal-platform-auth.server';
import { createInternalAssignmentTypeModuleHandlers } from '~/utils/internal-assignment-type-module-writes.server';
const handlers = createInternalAssignmentTypeModuleHandlers({ db: prisma, auditRead: recordInternalPlatformWriteAudit });
export const action = ({ request, params }: ActionFunctionArgs) => handlers.createStep(request, params.id, params.moduleId);
export const loader = ({ request, params }: LoaderFunctionArgs) => handlers.createStep(request, params.id, params.moduleId);
