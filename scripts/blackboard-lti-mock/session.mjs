const COOKIE = 'bb_learn';

export function readSession(cookieHeader) {
  const match = String(cookieHeader || '').match(
    new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)
  );
  if (!match) return null;
  const role = decodeURIComponent(match[1]);
  if (role === 'Learner' || role === 'Instructor') return { role };
  return null;
}

export function sessionCookie(role, publicBasePath = '') {
  const path = publicBasePath || '/';
  return `${COOKIE}=${encodeURIComponent(role)}; Path=${path}; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie(publicBasePath = '') {
  const path = publicBasePath || '/';
  return `${COOKIE}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function requestPublicBasePath(config, request) {
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '')
    .split(':')[0]
    .toLowerCase();
  if (host.startsWith('blackboard-pr-')) return '';
  return config.publicBasePath || '';
}

export function appPath(publicBasePath, path) {
  const base = String(publicBasePath || '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
