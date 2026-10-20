import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  isBlackboardLtiMockVerificationEnabled,
  isYawpProductionEnvironment,
  resolveLtiLaunchPlatform,
} from './platform.server.ts';
import {
  ltiHandshakeClearCookieHeader,
  readLtiHandshakeCookies,
} from './handshake.server.ts';

export type VerifiedLtiLaunch = {
  payload: JWTPayload;
  clearHandshake: boolean;
};

function invalidTokenResponse(
  message: string,
  status: number,
  clearHandshake: boolean
): Response {
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
  };
  if (clearHandshake) {
    headers['set-cookie'] = ltiHandshakeClearCookieHeader();
  }
  return new Response(message, { status, headers });
}

function decodeUnsignedPayload(idToken: string): JWTPayload | null {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as JWTPayload;
  } catch {
    return null;
  }
}

function audienceMatches(payload: JWTPayload, clientId: string): boolean {
  if (!clientId) return true;
  const aud = payload.aud;
  if (typeof aud === 'string') return aud === clientId;
  if (Array.isArray(aud)) return aud.includes(clientId);
  return false;
}

export async function verifyLtiLaunchIdToken(input: {
  idToken: string;
  state: string;
  request: Request;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: true; value: VerifiedLtiLaunch } | { ok: false; response: Response }> {
  const env = input.env ?? process.env;
  const idToken = String(input.idToken || '').trim();
  if (!idToken) {
    return {
      ok: false,
      response: invalidTokenResponse('missing id_token', 400, false),
    };
  }

  const handshake = readLtiHandshakeCookies(input.request);
  const postedState = String(input.state || '').trim();
  const hasHandshake = Boolean(handshake.state);
  if (hasHandshake) {
    if (!postedState || postedState !== handshake.state) {
      return {
        ok: false,
        response: invalidTokenResponse('invalid state', 400, true),
      };
    }
  }

  const clientIdHint =
    handshake.clientId ||
    String(env.LTI_CLIENT_ID || 'yawp-blackboard-mock').trim();
  const platform = resolveLtiLaunchPlatform(clientIdHint, env);
  const mockFallbackAllowed =
    isBlackboardLtiMockVerificationEnabled(env) && !isYawpProductionEnvironment(env);

  if (!platform) {
    return {
      ok: false,
      response: invalidTokenResponse('invalid id_token', 401, hasHandshake),
    };
  }

  let payload: JWTPayload | null = null;
  let verified = false;
  try {
    const jwks = createRemoteJWKSet(new URL(platform.jwksUrl));
    const result = await jwtVerify(idToken, jwks, {
      issuer: platform.issuer,
    });
    payload = result.payload;
    verified = true;
  } catch {
    if (!mockFallbackAllowed) {
      return {
        ok: false,
        response: invalidTokenResponse('invalid id_token', 401, hasHandshake),
      };
    }
    payload = decodeUnsignedPayload(idToken);
    if (!payload || String(payload.iss || '') !== platform.issuer) {
      return {
        ok: false,
        response: invalidTokenResponse('invalid id_token', 401, hasHandshake),
      };
    }
  }

  if (!payload) {
    return {
      ok: false,
      response: invalidTokenResponse('invalid id_token', 401, hasHandshake),
    };
  }

  if (verified && !audienceMatches(payload, platform.clientId)) {
    return {
      ok: false,
      response: invalidTokenResponse('invalid id_token', 401, hasHandshake),
    };
  }

  if (handshake.nonce && payload.nonce && payload.nonce !== handshake.nonce) {
    return {
      ok: false,
      response: invalidTokenResponse('invalid nonce', 400, hasHandshake),
    };
  }

  return {
    ok: true,
    value: {
      payload,
      clearHandshake: hasHandshake,
    },
  };
}
