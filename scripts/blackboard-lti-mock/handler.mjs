import { randomBytes, randomUUID } from 'node:crypto';
import { generateRsaSigningKey } from './keys.mjs';
import { decodeJwt, signJwt, verifyJwt } from './jwt.mjs';
import {
  ALL_SERVICE_SCOPES,
  AGS_SCOPES,
  recordEvent,
  scoreKey,
} from './config.mjs';
import { ROLE_URIS, buildLaunchProfile } from './claims.mjs';
import { rememberDeepLinkedContent, tryLearnRoute } from './learn-routes.mjs';

function send(response, status, body, headers = {}) {
  if (response.headersSent || response.destroyed) return;
  const payload =
    body == null
      ? ''
      : typeof body === 'string' || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body);
  const contentType =
    typeof body === 'string' && body.trim().startsWith('<')
      ? 'text/html; charset=utf-8'
      : typeof body === 'string'
        ? 'text/plain; charset=utf-8'
        : 'application/json; charset=utf-8';
  response.writeHead(status, {
    'content-type': body == null || body === '' ? 'text/plain; charset=utf-8' : contentType,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-yawp-lti-fault',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...headers,
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function parseBody(raw, contentType) {
  const text = raw.toString('utf8');
  if (!text) return {};
  if (contentType.includes('json') || text.trim().startsWith('{')) {
    return JSON.parse(text);
  }
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}

function requestUrl(request, origin) {
  return new URL(request.url, origin);
}

function faultFrom(url, headers, body = {}) {
  return (
    url.searchParams.get('fault') ||
    headers['x-yawp-lti-fault'] ||
    body.fault ||
    ''
  );
}

function originFrom(config, request, listenOrigin) {
  if (config.publicUrl) return config.publicUrl;
  const proto = request.headers['x-forwarded-proto'] || 'http';
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  if (host) return `${proto}://${host}${config.publicBasePath}`;
  return `${listenOrigin}${config.publicBasePath}`;
}

function decodeHint(value) {
  if (!value) return {};
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function resolveToolJwk(config, kid) {
  if (config.toolPublicJwk) return config.toolPublicJwk;
  if (!config.toolJwksUrl) return null;
  const response = await fetch(config.toolJwksUrl);
  if (!response.ok) throw new Error('Tool JWKS fetch failed');
  const jwks = await response.json();
  return (jwks.keys || []).find((key) => !kid || key.kid === kid) || null;
}

export function createMockHandler({ config, store, keys, listenOrigin }) {
  return async function handler(request, response) {
    const started = Date.now();
    let status = 500;
    let detail = {};
    try {
      if (request.method === 'OPTIONS') {
        status = 204;
        send(response, 204, '');
        return;
      }
      const publicOrigin = originFrom(config, request, listenOrigin);
      const url = requestUrl(request, publicOrigin);
      const raw = await readBody(request);
      const body = parseBody(raw, String(request.headers['content-type'] || ''));
      const result = await route({
        request,
        response,
        url,
        body,
        raw,
        config,
        store,
        keys,
        publicOrigin,
        send,
        handleDevLaunch,
      });
      status = result?.status ?? response.statusCode ?? 200;
      detail = result?.detail || {};
    } catch (error) {
      status = error.status || 500;
      detail = { error: error.message };
      if (!response.headersSent) {
        send(response, status, { error: error.message });
      }
    } finally {
      recordEvent(store, {
        method: request.method,
        path: request.url,
        status,
        ms: Date.now() - started,
        detail,
      });
    }
  };
}

async function route(ctx) {
  const { url, request, response, body, config, store, keys, publicOrigin } = ctx;
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const fault = faultFrom(url, request.headers, body);

  if (pathname === '/healthz') {
    send(response, 200, 'ok');
    return { status: 200 };
  }
  const learn = tryLearnRoute(ctx, { handleDevLaunch, send });
  if (learn) return learn;
  if (pathname.endsWith('/jwks.json') || pathname === '/jwks') {
    send(response, 200, keys.jwks());
    return { status: 200 };
  }
  if (pathname === '/dev/events' && request.method === 'GET') {
    send(response, 200, store.events);
    return { status: 200 };
  }
  if (pathname === '/dev/events' && request.method === 'DELETE') {
    store.events.length = 0;
    send(response, 204, '');
    return { status: 204 };
  }
  if (pathname === '/dev/scores') {
    send(response, 200, {
      received: store.scoresReceived,
      current: [...store.scoresCurrent.values()],
    });
    return { status: 200 };
  }
  if (pathname === '/dev/deep-links') {
    send(response, 200, store.deepLinks);
    return { status: 200 };
  }
  if (pathname === '/dev/rotate-keys' && request.method === 'POST') {
    const next = keys.rotate();
    send(response, 200, { kid: next.kid });
    return { status: 200, detail: { kid: next.kid } };
  }
  if (pathname === '/dev/launch') {
    return handleDevLaunch(ctx, fault);
  }
  if (pathname === '/dev/fire-fault' && request.method === 'POST') {
    return fireEndpointFault(ctx, fault || url.searchParams.get('fault'));
  }
  if (pathname === '/api/v1/gateway/oidcauth') {
    return handleOidcAuth(ctx, fault);
  }
  if (pathname === '/api/v1/gateway/oauth2/jwttoken') {
    return handleToken(ctx, fault);
  }
  if (pathname === '/api/v1/lti/deep-linking') {
    return handleDeepLinking(ctx);
  }

  const lineItemsMatch = pathname.match(
    /^\/learn\/api\/v1\/lti\/courses\/([^/]+)\/lineItems(?:\/([^/]+))?(?:\/(scores|results|lineitem))?$/
  );
  if (lineItemsMatch) {
    return handleAgs(ctx, fault, {
      contextId: decodeURIComponent(lineItemsMatch[1]),
      lineItemId: lineItemsMatch[2] ? decodeURIComponent(lineItemsMatch[2]) : '',
      suffix: lineItemsMatch[3] || '',
    });
  }

  send(response, 404, { error: 'Not found' });
  return { status: 404 };
}

function handleDevLaunch({ url, response, config, store, publicOrigin }, fault) {
  const profile = buildLaunchProfile({
    role: url.searchParams.get('role'),
    sub: url.searchParams.get('sub'),
    contextId: url.searchParams.get('context_id'),
    contextLabel: url.searchParams.get('context_label'),
    contextTitle: url.searchParams.get('context_title'),
    resourceLinkId: url.searchParams.get('resource_link_id'),
    resourceLinkTitle: url.searchParams.get('resource_link_title'),
    messageType: url.searchParams.get('message_type'),
    fault,
    kid: url.searchParams.get('kid'),
  });
  const hintId = `hint_${randomUUID()}`;
  store.launchHints.set(hintId, profile);
  // Prefer the same preview host that served this page to avoid cross-preview hops
  // and avoid internal Docker hostnames in browser redirects.
  const xfProto = request.headers['x-forwarded-proto'] || '';
  const xfHost = request.headers['x-forwarded-host'] || '';
  const hostOrigin =
    (xfHost ? `${xfProto || 'https'}://${xfHost}` : null) ||
    new URL(publicOrigin).origin;
  const login = new URL('/lti/login', hostOrigin);
  login.searchParams.set('iss', config.issuer);
  login.searchParams.set('login_hint', profile.user.sub);
  login.searchParams.set(
    'target_link_uri',
    new URL('/lti/launch', hostOrigin).toString()
  );
  login.searchParams.set('lti_message_hint', hintId);
  login.searchParams.set('client_id', config.clientId);
  login.searchParams.set('lti_deployment_id', config.deploymentId);
  if (url.searchParams.get('format') === 'json') {
    send(response, 200, {
      loginUrl: login.toString(),
      hint: hintId,
      profile,
    });
    return { status: 200, detail: { hint: hintId, role: profile.role } };
  }
  response.writeHead(302, { location: login.toString(), 'cache-control': 'no-store' });
  response.end();
  return { status: 302, detail: { hint: hintId, role: profile.role } };
}

async function fireEndpointFault(ctx, fault) {
  const { response, publicOrigin, config, store, keys } = ctx;
  if (fault === 'token_endpoint_failure') {
    send(response, 503, { error: 'server_error', fault });
    return { status: 503, detail: { fault } };
  }
  send(response, 200, {
    ok: true,
    fault,
    target: `${publicOrigin}/learn/api/v1/lti/courses/_4_1/lineItems`,
    note: 'Replay this fault with header X-Yawp-Lti-Fault or query ?fault=',
  });
  return { status: 200, detail: { fault } };
}

function selectSigningKey(keys, requestedKid, fault) {
  if (fault === 'mis_signed_jwt') return generateRsaSigningKey();
  if (requestedKid) return keys.get(requestedKid) || keys.active();
  return keys.active();
}

function applyLaunchFaults(payload, header, token, { config, store, fault }) {
  if (fault === 'expired_launch') {
    payload.exp = Math.floor(config.now() / 1000) - 60;
    payload.iat = payload.exp - 3600;
  }
  if (fault === 'unknown_deployment') {
    payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] =
      'unknown-deployment';
  }
  if (fault === 'wrong_audience') {
    payload.aud = 'some-other-client';
  }
  if (fault === 'replayed_nonce') {
    payload.nonce = store.issuedNonces[0] || payload.nonce;
  }
  return { payload, header, token };
}

function handleOidcAuth(ctx, fault) {
  const { url, request, response, body, config, store, keys, publicOrigin } = ctx;
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(body || {})) {
    if (value != null && !params.has(key)) params.set(key, String(value));
  }
  const hint =
    store.launchHints.get(params.get('lti_message_hint')) ||
    decodeHint(params.get('lti_message_hint'));
  const profile = buildLaunchProfile({
    ...hint,
    role: params.get('role') || hint.role,
    sub: params.get('sub') || hint.user?.sub || params.get('login_hint'),
    contextId: params.get('context_id') || hint.context?.id,
    contextLabel: params.get('context_label') || hint.context?.label,
    contextTitle: params.get('context_title') || hint.context?.title,
    resourceLinkId: params.get('resource_link_id') || hint.resourceLink?.id,
    resourceLinkTitle: params.get('resource_link_title') || hint.resourceLink?.title,
    messageType: params.get('message_type') || hint.messageType,
    fault: fault || hint.fault,
    kid: params.get('kid') || hint.kid,
  });
  const redirectUri = params.get('redirect_uri') || config.toolRedirectUri;
  const state = params.get('state') || '';
  const nonce = params.get('nonce') || randomUUID();
  const now = Math.floor(config.now() / 1000);
  const contextId = profile.context.id;
  const lineItemId =
    store.defaultLineItemIdByContext.get(contextId) || `_${profile.resourceLink.id.replace(/^_/, '')}_grade`;
  store.defaultLineItemIdByContext.set(contextId, lineItemId);

  const payload = {
    nonce,
    iss: config.issuer,
    aud: config.clientId,
    sub: profile.user.sub,
    name: profile.user.name,
    given_name: profile.user.given_name,
    family_name: profile.user.family_name,
    email: profile.user.email,
    locale: profile.user.locale || 'en-US',
    iat: now,
    exp: now + 600,
    'https://purl.imsglobal.org/spec/lti/claim/message_type': profile.messageType,
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': config.deploymentId,
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
      params.get('target_link_uri') || config.toolRedirectUri,
    'https://purl.imsglobal.org/spec/lti/claim/roles': ROLE_URIS[profile.role],
    'https://purl.imsglobal.org/spec/lti/claim/context': profile.context,
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': profile.resourceLink,
    'https://purl.imsglobal.org/spec/lti/claim/tool_platform': {
      name: 'Blackboard, Inc.',
      description: 'Blackboard Learn (YAWP mock)',
      guid: config.platformGuid,
      product_family_code: 'BlackboardLearn',
      version: '3900.93.0-rel.59+mock',
      url: publicOrigin,
      contact_email: 'dev@localhost',
    },
    'https://purl.imsglobal.org/spec/lti/claim/launch_presentation': {
      document_target: 'iframe',
      return_url: `${publicOrigin}/dev`,
      locale: 'en-US',
    },
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
      scope: [
        AGS_SCOPES.lineitem,
        AGS_SCOPES.lineitemReadonly,
        AGS_SCOPES.score,
        AGS_SCOPES.resultReadonly,
      ],
      lineitems: `${publicOrigin}/learn/api/v1/lti/courses/${encodeURIComponent(contextId)}/lineItems`,
      lineitem: `${publicOrigin}/learn/api/v1/lti/courses/${encodeURIComponent(contextId)}/lineItems/${encodeURIComponent(lineItemId)}`,
    },
    'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': {
      context_memberships_url: `${publicOrigin}/learn/api/v1/lti/external/namesandroles/${encodeURIComponent(contextId)}`,
      scope: ['https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'],
      service_versions: ['2.0'],
    },
  };

  if (profile.messageType === 'LtiDeepLinkingRequest') {
    payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'] = {
      deep_link_return_url: `${publicOrigin}/api/v1/lti/deep-linking`,
      accept_types: ['ltiResourceLink', 'link'],
      accept_presentation_document_targets: ['iframe', 'window'],
      accept_multiple: true,
      auto_create: true,
      title: profile.resourceLink.title,
      data: `dl_${randomUUID()}`,
    };
  }

  applyLaunchFaults(payload, {}, '', { config, store, fault: profile.fault });
  if (!store.issuedNonces.includes(payload.nonce)) {
    store.issuedNonces.unshift(payload.nonce);
  }
  const signingKey = selectSigningKey(keys, profile.kid, profile.fault);
  let token = signJwt(payload, signingKey.privateKeyPem, { kid: signingKey.kid });
  if (profile.fault === 'invalid_jwt') {
    token = `${token.slice(0, -4)}xxxx`;
  }

  if (params.get('format') === 'json' || request.headers.accept?.includes('application/json')) {
    send(response, 200, { id_token: token, state, payload });
    return { status: 200, detail: { nonce: payload.nonce, fault: profile.fault } };
  }

  const html = `<!doctype html><form id="lti" method="POST" action="${escapeHtml(redirectUri)}">
<input type="hidden" name="id_token" value="${escapeHtml(token)}" />
<input type="hidden" name="state" value="${escapeHtml(state)}" />
</form><script>document.getElementById('lti').submit()</script>`;
  send(response, 200, html);
  return { status: 200, detail: { nonce: payload.nonce, fault: profile.fault } };
}

async function handleToken(ctx, fault) {
  const { response, body, config, store, keys, publicOrigin } = ctx;
  if (fault === 'token_endpoint_failure') {
    send(response, 503, { error: 'server_error' });
    return { status: 503, detail: { fault } };
  }
  if (body.grant_type !== 'client_credentials') {
    send(response, 400, { error: 'unsupported_grant_type' });
    return { status: 400 };
  }
  if (
    body.client_assertion_type !==
    'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
  ) {
    send(response, 400, { error: 'invalid_request' });
    return { status: 400 };
  }
  try {
    const decoded = decodeJwt(body.client_assertion);
    const jwk = await resolveToolJwk(config, decoded.header.kid);
    verifyJwt(body.client_assertion, jwk, { now: config.now() });
    if (decoded.payload.iss !== config.clientId || decoded.payload.sub !== config.clientId) {
      throw Object.assign(new Error('client_assertion iss/sub mismatch'), { status: 401 });
    }
  } catch (error) {
    send(response, 401, { error: 'invalid_client', error_description: error.message });
    return { status: 401, detail: { error: error.message } };
  }

  const requested = String(body.scope || '')
    .split(/\s+/)
    .filter(Boolean);
  const granted = (requested.length ? requested : ALL_SERVICE_SCOPES).filter((scope) =>
    ALL_SERVICE_SCOPES.includes(scope)
  );
  if (granted.length === 0) {
    send(response, 400, { error: 'invalid_scope' });
    return { status: 400 };
  }
  const now = Math.floor(config.now() / 1000);
  const access = signJwt(
    {
      iss: config.issuer,
      sub: config.clientId,
      aud: `${publicOrigin}/learn/api/v1/lti`,
      iat: now,
      exp: now + config.tokenTtlSeconds,
      jti: randomUUID(),
      scope: granted.join(' '),
    },
    keys.active().privateKeyPem,
    { kid: keys.active().kid }
  );
  store.accessTokens.set(access, {
    scopes: granted,
    exp: now + config.tokenTtlSeconds,
  });
  send(response, 200, {
    access_token: access,
    token_type: 'Bearer',
    expires_in: config.tokenTtlSeconds,
    scope: granted.join(' '),
  });
  return { status: 200, detail: { scope: granted } };
}

async function requireAgsAuth(ctx, neededScope) {
  const { request, config, keys } = ctx;
  const header = String(request.headers.authorization || '');
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) {
    const error = new Error('missing bearer token');
    error.status = 401;
    throw error;
  }
  const jwks = keys.jwks().keys;
  const decoded = decodeJwt(token);
  const jwk = jwks.find((key) => key.kid === decoded.header.kid);
  verifyJwt(token, jwk, { now: config.now() });
  const scopes = String(decoded.payload.scope || '').split(/\s+/);
  const allowed =
    scopes.includes(neededScope) ||
    (neededScope === AGS_SCOPES.lineitemReadonly &&
      scopes.includes(AGS_SCOPES.lineitem));
  if (!allowed) {
    const error = new Error('insufficient scope');
    error.status = 403;
    throw error;
  }
  return { token, scopes, payload: decoded.payload };
}

async function handleAgs(ctx, fault, parts) {
  const { request, response, body, config, store, publicOrigin } = ctx;
  if (fault === 'ags_timeout') {
    await new Promise((resolve) => setTimeout(resolve, config.timeoutDelayMs));
  }
  if (fault === 'ags_5xx') {
    send(response, 503, { error: 'service_unavailable' });
    return { status: 503, detail: { fault } };
  }
  if (fault === 'ags_403_missing_scope') {
    send(response, 403, { error: 'insufficient_scope' });
    return { status: 403, detail: { fault } };
  }

  const isCollection = !parts.lineItemId;
  const isScores = parts.suffix === 'scores';
  const isResults = parts.suffix === 'results';

  if (request.method === 'POST' && isCollection) {
    await requireAgsAuth(ctx, AGS_SCOPES.lineitem);
    const id = `_${randomBytes(3).toString('hex')}_1`;
    const itemUrl = `${publicOrigin}/learn/api/v1/lti/courses/${encodeURIComponent(parts.contextId)}/lineItems/${id}`;
    const item = {
      id: itemUrl,
      scoreMaximum: Number(body.scoreMaximum),
      label: body.label || 'Line item',
      resourceId: body.resourceId || '',
      tag: body.tag || '',
      resourceLinkId: body.resourceLinkId || '',
      startDateTime: body.startDateTime,
      endDateTime: body.endDateTime,
      contextId: parts.contextId,
      lineItemId: id,
    };
    store.lineItems.set(id, item);
    send(response, 201, item, {
      location: itemUrl,
      'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
    });
    return { status: 201, detail: { lineItemId: id } };
  }

  if (request.method === 'GET' && isCollection) {
    await requireAgsAuth(ctx, AGS_SCOPES.lineitemReadonly);
    const items = [...store.lineItems.values()].filter(
      (item) => item.contextId === parts.contextId
    );
    send(response, 200, items, {
      'content-type': 'application/vnd.ims.lis.v2.lineitemcontainer+json',
    });
    return { status: 200 };
  }

  if (request.method === 'GET' && parts.lineItemId && !isScores && !isResults) {
    await requireAgsAuth(ctx, AGS_SCOPES.lineitemReadonly);
    const item = store.lineItems.get(parts.lineItemId);
    if (!item) {
      send(response, 404, { error: 'not found' });
      return { status: 404 };
    }
    send(response, 200, item, {
      'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
    });
    return { status: 200 };
  }

  if (request.method === 'POST' && isScores) {
    await requireAgsAuth(ctx, AGS_SCOPES.score);
    const received = {
      ...body,
      lineItemId: parts.lineItemId,
      contextId: parts.contextId,
      receivedAt: new Date(config.now()).toISOString(),
    };
    store.scoresReceived.push(received);
    const key = scoreKey(parts.lineItemId, body.userId);
    const existing = store.scoresCurrent.get(key);
    if (!existing || Date.parse(body.timestamp) >= Date.parse(existing.timestamp)) {
      store.scoresCurrent.set(key, received);
    }
    send(response, 204, '');
    return { status: 204, detail: { userId: body.userId, lineItemId: parts.lineItemId } };
  }

  if (request.method === 'GET' && isResults) {
    await requireAgsAuth(ctx, AGS_SCOPES.resultReadonly);
    const results = [...store.scoresCurrent.values()]
      .filter((score) => score.lineItemId === parts.lineItemId)
      .map((score) => ({
        id: `${publicOrigin}/learn/api/v1/lti/courses/${parts.contextId}/lineItems/${parts.lineItemId}/results/${score.userId}`,
        userId: score.userId,
        resultScore: score.scoreGiven,
        resultMaximum: score.scoreMaximum,
        comment: score.comment,
        scoringUserId: score.scoringUserId,
      }));
    send(response, 200, results, {
      'content-type': 'application/vnd.ims.lis.v2.resultcontainer+json',
    });
    return { status: 200 };
  }

  send(response, 405, { error: 'method not allowed' });
  return { status: 405 };
}

async function handleDeepLinking(ctx) {
  const { response, body, config, store } = ctx;
  const jwt = body.JWT || body.jwt || body.id_token;
  if (!jwt) {
    send(response, 400, { error: 'missing JWT' });
    return { status: 400 };
  }
  try {
    const decoded = decodeJwt(jwt);
    const jwk = await resolveToolJwk(config, decoded.header.kid);
    verifyJwt(jwt, jwk, { now: config.now() });
    const contentItems =
      decoded.payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] || [];
    const record = {
      receivedAt: new Date(config.now()).toISOString(),
      deploymentId:
        decoded.payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      data: decoded.payload['https://purl.imsglobal.org/spec/lti-dl/claim/data'],
      contentItems,
    };
    store.deepLinks.push(record);
    rememberDeepLinkedContent(store, contentItems);
    send(response, 200, record);
    return { status: 200, detail: { count: contentItems.length } };
  } catch (error) {
    send(response, 401, { error: 'invalid_jwt', error_description: error.message });
    return { status: 401, detail: { error: error.message } };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
