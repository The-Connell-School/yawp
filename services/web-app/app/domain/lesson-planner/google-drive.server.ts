/**
 * Google Docs from the stack page (Oct 24 handoff, task 3): a click on
 * Google Docs puts the plan or the handouts in the teacher's Drive as a real
 * Google Doc and opens it. Only drive.file: Yawp! sees the files it makes,
 * nothing else in their Drive. The permission is asked once and kept, the
 * refresh token sealed with the session secret.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { googleOriginAllowed } from '~/domain/unified-signon/google.server';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Env = Record<string, string | undefined>;

export function googleDocsReady(origin: string, env: Env = process.env): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() && googleOriginAllowed(origin, env));
}

export function driveAuthUrl(
  { callback, state, email }: { callback: string; state: string; email?: string | null },
  env: Env = process.env
): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: callback,
    response_type: 'code',
    scope: DRIVE_FILE_SCOPE,
    access_type: 'offline',
    // Consent, so Google hands back a refresh token to keep.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    ...(email ? { login_hint: email } : {}),
  }).toString();
  return url.toString();
}

export async function exchangeDriveCode(
  { code, callback }: { code: string; callback: string },
  env: Env = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ accessToken: string; refreshToken: string | null; scope: string } | null> {
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: callback,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string; refresh_token?: string; scope?: string };
  if (!body.access_token) return null;
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, scope: body.scope ?? DRIVE_FILE_SCOPE };
}

/** A fresh access token, or null when the permission is gone. */
export async function refreshDriveAccess(
  refreshToken: string,
  env: Env = process.env,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string };
  return body.access_token ?? null;
}

/** Uploads a Word file, converted to a Google Doc; its link, or null. */
export async function uploadAsGoogleDoc(
  { accessToken, name, docx }: { accessToken: string; name: string; docx: Uint8Array },
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const boundary = `yawp-${randomBytes(12).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document' }) +
        `\r\n--${boundary}\r\nContent-Type: ${DOCX}\r\n\r\n`
    ),
    Buffer.from(docx),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await fetcher(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return null;
  const file = (await response.json()) as { id?: string; webViewLink?: string };
  return file.webViewLink ?? (file.id ? `https://docs.google.com/document/d/${file.id}/edit` : null);
}

function keys(env: Env): Buffer[] {
  return (env.SESSION_SECRET ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean)
    .map((secret) => createHash('sha256').update(`google-drive-grant:${secret}`).digest());
}

export function sealToken(token: string, env: Env = process.env): string {
  const key = keys(env)[0];
  if (!key) throw new Error('SESSION_SECRET is not set');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function openToken(sealed: string, env: Env = process.env): string | null {
  const data = Buffer.from(sealed, 'base64');
  for (const key of keys(env)) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      // Try the next secret.
    }
  }
  return null;
}
