/**
 * The Faculty Lounge keeps Community only. Training courses stay in the
 * database and at their own URLs (assignment tutorials still open them);
 * the Trainings tab and the course grid are not a destination while the
 * community is on. Flag off, the course grid is still the Teacher's Lounge.
 */
export function facultyLoungeTrainingsHome(communityEnabled: boolean): string {
  return communityEnabled ? '/app/lounge' : '/app/teacher-trainings';
}
