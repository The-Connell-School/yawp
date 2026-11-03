import { teacherTrainingRoute } from '~/utils/internal-teacher-training-routes.server';

export const loader = teacherTrainingRoute({});
export const action = teacherTrainingRoute({ DELETE: 'deleteResource' });
