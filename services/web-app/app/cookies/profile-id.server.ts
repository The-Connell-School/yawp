import { createCookie } from 'react-router';

const cookieName = 'profile-id';

export const profileIdCookie = createCookie(cookieName, {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  secrets: process.env.SESSION_SECRET.split(','),
});

export function destroyProfileId() {
  return profileIdCookie.serialize('', { maxAge: -1 });
}

export async function getProfileId(request: Request): Promise<string> {
  const rawCookie = request.headers.get('cookie');
  const profileId = rawCookie ? await profileIdCookie.parse(rawCookie) : null;
  return profileId;
}

export async function setProfileId(profileId: String) {
  return profileIdCookie.serialize(profileId, { maxAge: 60 * 10 });
}
