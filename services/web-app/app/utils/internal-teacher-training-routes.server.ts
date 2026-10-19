import type { ActionFunctionArgs } from 'react-router';
import { prisma } from './db.server';
import { recordInternalPlatformWriteAudit } from './internal-platform-auth.server';
import { response } from './internal-admin-write.server';
import {
  createInternalTeacherTrainingHandlers,
  type TrainingOperation,
} from './internal-teacher-trainings.server';
const handlers = createInternalTeacherTrainingHandlers({
  db: prisma,
  auditRead: recordInternalPlatformWriteAudit,
});
export function teacherTrainingRoute(
  methods: Partial<Record<string, TrainingOperation>>
) {
  return ({
    request,
    params,
  }: Pick<ActionFunctionArgs, 'request' | 'params'>) => {
    const operation = methods[request.method];
    return operation
      ? handlers.handle(operation, request, params)
      : response({ error: 'Method not allowed' }, 405);
  };
}
