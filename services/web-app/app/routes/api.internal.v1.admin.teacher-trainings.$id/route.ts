import { teacherTrainingRoute } from '~/utils/internal-teacher-training-routes.server';

export const loader = teacherTrainingRoute({ GET: 'detail' });
export const action = teacherTrainingRoute({
  PATCH: 'update',
  DELETE: 'delete',
});
