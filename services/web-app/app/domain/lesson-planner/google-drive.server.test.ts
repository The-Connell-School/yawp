import { describe, expect, test } from 'bun:test';
import {
  DRIVE_FILE_SCOPE,
  driveAuthUrl,
  exchangeDriveCode,
  googleDocsReady,
  openToken,
  refreshDriveAccess,
  sealToken,
  uploadAsGoogleDoc,
} from './google-drive.server';

const ENV = { GOOGLE_OAUTH_CLIENT_ID: 'client-1', GOOGLE_OAUTH_CLIENT_SECRET: 'secret-1', SESSION_SECRET: 'a,b' };

function fakeFetch(reply: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return reply(String(url), init ?? {});
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('Google Docs through Drive, drive.file only (Oct 24 handoff, task 3)', () => {
  test('ready only with the OAuth client, and on an origin Google knows', () => {
    expect(googleDocsReady('https://yawp.school', ENV)).toBe(true);
    expect(googleDocsReady('https://yawp.school', { ...ENV, GOOGLE_OAUTH_CLIENT_SECRET: '' })).toBe(false);
    expect(
      googleDocsReady('https://pr-9.preview.yawp.school', { ...ENV, GOOGLE_OAUTH_REQUIRE_ORIGIN_ALLOWLIST: 'true' })
    ).toBe(false);
  });

  test('asks once for the files it makes, and to keep the permission', () => {
    const url = new URL(driveAuthUrl({ callback: 'https://yawp.school/app/lesson-planner/google/callback', state: 's1', email: 't@school.org' }, ENV));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe(DRIVE_FILE_SCOPE);
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('s1');
    expect(url.searchParams.get('login_hint')).toBe('t@school.org');
    expect(url.searchParams.get('client_id')).toBe('client-1');
  });

  test('the code becomes a refresh token, and a refresh token an access token', async () => {
    const google = fakeFetch((url) =>
      url.endsWith('/token')
        ? Response.json({ access_token: 'at-1', refresh_token: 'rt-1', scope: DRIVE_FILE_SCOPE })
        : new Response('', { status: 404 })
    );
    expect(await exchangeDriveCode({ code: 'c1', callback: 'https://x/cb' }, ENV, google.fn)).toEqual({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      scope: DRIVE_FILE_SCOPE,
    });
    expect(String(google.calls[0]!.init.body)).toContain('grant_type=authorization_code');
    expect(await refreshDriveAccess('rt-1', ENV, google.fn)).toBe('at-1');
    expect(String(google.calls[1]!.init.body)).toContain('grant_type=refresh_token');

    const revoked = fakeFetch(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    expect(await refreshDriveAccess('rt-1', ENV, revoked.fn)).toBeNull();
  });

  test('the Word file goes up as a Google Doc, and its link comes back', async () => {
    const drive = fakeFetch(() => Response.json({ id: 'doc-1', webViewLink: 'https://docs.google.com/document/d/doc-1/edit' }));
    const link = await uploadAsGoogleDoc({ accessToken: 'at-1', name: 'Day One - Lesson plan', docx: new Uint8Array([80, 75, 3, 4]) }, drive.fn);
    expect(link).toBe('https://docs.google.com/document/d/doc-1/edit');
    const call = drive.calls[0]!;
    expect(call.url).toContain('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    expect((call.init.headers as Record<string, string>).Authorization).toBe('Bearer at-1');
    const body = Buffer.from(call.init.body as Uint8Array).toString('latin1');
    expect(body).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(body).toContain('"name":"Day One - Lesson plan"');
    expect(body).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  test('the refresh token is stored sealed, and opens with any current secret', () => {
    const sealed = sealToken('rt-secret', ENV);
    expect(sealed).not.toContain('rt-secret');
    expect(openToken(sealed, ENV)).toBe('rt-secret');
    expect(openToken(sealed, { ...ENV, SESSION_SECRET: 'c,a' })).toBe('rt-secret');
    expect(openToken(sealed, { ...ENV, SESSION_SECRET: 'z' })).toBeNull();
  });
});
