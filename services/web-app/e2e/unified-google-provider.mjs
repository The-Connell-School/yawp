// Node preload for isolated browser QA only. Never imported by deployed routes.
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
if (
  process.env.SIGNON_MOCK_GOOGLE !== '1' ||
  process.env.SIGNON_LOCAL_TEST !== '1' ||
  !['localhost', '127.0.0.1'].includes(
    new URL(process.env.DATABASE_URL).hostname
  ) ||
  process.env.GOOGLE_OAUTH_CLIENT_ID !== 'local-client' ||
  process.env.GOOGLE_OAUTH_CLIENT_SECRET !== 'local-secret'
)
  throw new Error(
    'Mock provider requires the isolated local sign-on test environment.'
  );
const pair = await generateKeyPair('RS256');
const jwk = {
  ...(await exportJWK(pair.publicKey)),
  kid: 'local-browser',
  alg: 'RS256',
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://www.googleapis.com/oauth2/v3/certs')
    return Response.json({ keys: [jwk] });
  if (url === 'https://oauth2.googleapis.com/token') {
    const params = new URLSearchParams(init.body);
    const code = JSON.parse(
      Buffer.from(params.get('code'), 'base64url').toString()
    );
    const challenge = createHash('sha256')
      .update(params.get('code_verifier'))
      .digest('base64url');
    if (challenge !== code.challenge)
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    const id_token = await new SignJWT({
      nonce: code.nonce,
      email: code.email,
      email_verified: true,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'local-browser' })
      .setIssuer('https://accounts.google.com')
      .setAudience('local-client')
      .setSubject(code.subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(pair.privateKey);
    return Response.json({ id_token });
  }
  if (
    new URL(url).hostname.endsWith('googleapis.com') ||
    new URL(url).hostname === 'accounts.google.com'
  )
    throw new Error('Live Google calls are forbidden in local QA.');
  return originalFetch(input, init);
};
