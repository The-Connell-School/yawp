import { generateStudentJoinToken } from './student-join-token';

export function studentJoinTokenForClassCreate(plan: string) {
  return plan === 'FREE_CLASSROOM' ? generateStudentJoinToken() : undefined;
}
