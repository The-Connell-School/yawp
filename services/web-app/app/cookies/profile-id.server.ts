import { createCookie } from 'react-router';

const cookieName = 'profile-id';
const PROFILE_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSessionSecrets(): string[] {
  const raw = process.env.SESSION_SECRET;
  const secrets = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return secrets.length ? secrets : ['dev-secret'];
}

export const profileIdCookie = createCookie(cookieName, {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  secrets: getSessionSecrets(),
});

export function destroyProfileId() {
  return profileIdCookie.serialize('', { maxAge: -1 });
}

export async function getProfileId(request: Request): Promise<string> {
  const rawCookie = request.headers.get('cookie');
  const profileId = rawCookie ? await profileIdCookie.parse(rawCookie) : null;
  return profileId;
}

export async function setProfileId(profileId: string) {
  if (!profileId) return destroyProfileId();

  return profileIdCookie.serialize(profileId, {
    maxAge: PROFILE_ID_COOKIE_MAX_AGE_SECONDS,
  });
}
