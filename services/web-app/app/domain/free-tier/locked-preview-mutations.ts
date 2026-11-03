/** Representative mutating routes reachable from the locked teacher UI (POST/PUT/PATCH/DELETE). */
export const LOCKED_PREVIEW_DENIED_MUTATIONS = [
  '/api/assignments/create',
  '/api/domain/reporter',
  '/api/domain/lesson-planner/packet',
  '/api/invitations',
  '/app/organization/students',
  '/app/my-classes',
  '/app/assignments',
  '/api/domain/update-submission',
  '/api/preferences/nav',
] as const;
