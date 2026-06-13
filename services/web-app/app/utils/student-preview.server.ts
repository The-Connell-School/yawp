import { authSessionStorage } from '../cookie-session-storages/authentication.server.ts';

const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 365 * 100;
const getSessionExpirationDate = () =>
  new Date(Date.now() + SESSION_EXPIRATION_TIME);

export const studentPreviewModeKey = 'studentPreviewMode';
export const studentPreviewOrgIdKey = 'studentPreviewOrgId';
export const readOnlyStudentPreviewMode = 'read-only';

export function canEnterStudentPreview(args: { role: string; isAdmin: boolean }) {
  return args.role === 'TEACHER' || args.isAdmin;
}

export function isStudentPreviewActive(state: { active: boolean }) {
  return state.active;
}

export function shouldUseStudentExperience(args: {
  membershipRole: string;
  previewActive: boolean;
}) {
  return args.membershipRole === 'STUDENT' || args.previewActive;
}

export async function getStudentPreviewState(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );

  return {
    active:
      authSession.get(studentPreviewModeKey) === readOnlyStudentPreviewMode,
    organizationId:
      (authSession.get(studentPreviewOrgIdKey) as string | null) ?? null,
  };
}

export async function startStudentPreview(
  request: Request,
  organizationId: string
) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  authSession.set(studentPreviewModeKey, readOnlyStudentPreviewMode);
  authSession.set(studentPreviewOrgIdKey, organizationId);

  return authSessionStorage.commitSession(authSession, {
    expires: getSessionExpirationDate(),
  });
}

export async function endStudentPreview(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  authSession.unset(studentPreviewModeKey);
  authSession.unset(studentPreviewOrgIdKey);

  return authSessionStorage.commitSession(authSession, {
    expires: getSessionExpirationDate(),
  });
}
