export const LTI_STATE_COOKIE = 'yawp_lti_state';
export const LTI_NONCE_COOKIE = 'yawp_lti_nonce';
export const LTI_CLIENT_COOKIE = 'yawp_lti_client';

export type LtiHandshakeCookies = {
  state: string;
  nonce: string;
  clientId: string;
};

export function readLtiHandshakeCookies(request: Request): LtiHandshakeCookies {
  const raw = request.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const [k, v] = part.split('=');
    if (!k) continue;
    out[k.trim()] = decodeURIComponent((v || '').trim());
  }
  return {
    state: out[LTI_STATE_COOKIE] || '',
    nonce: out[LTI_NONCE_COOKIE] || '',
    clientId: out[LTI_CLIENT_COOKIE] || '',
  };
}

function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function ltiHandshakeClearCookieHeader(): string {
  return [
    clearCookie(LTI_STATE_COOKIE),
    clearCookie(LTI_NONCE_COOKIE),
    clearCookie(LTI_CLIENT_COOKIE),
  ].join(', ');
}

export function setLtiHandshakeCookieHeader(
  state: string,
  nonce: string,
  clientId: string
): string {
  const expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString();
  const set = (name: string, value: string) =>
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
  return [
    set(LTI_STATE_COOKIE, state),
    set(LTI_NONCE_COOKIE, nonce),
    set(LTI_CLIENT_COOKIE, clientId),
  ].join(', ');
}
