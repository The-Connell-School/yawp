import { teacherTrainingRoute } from '~/utils/internal-teacher-training-routes.server';

export const loader = teacherTrainingRoute({ GET: 'list' });
export const action = teacherTrainingRoute({ POST: 'create' });
