import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { assertBlackboardLtiMockAllowed } from './production-guard.mjs';
import { createRotatingKeySet } from './keys.mjs';
import { resolveMockConfig, createStore } from './config.mjs';
import { createMockHandler } from './handler.mjs';

export function isDirectExecution(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

export function createBlackboardLtiPlatform(overrides = {}) {
  const config = resolveMockConfig(overrides);
  assertBlackboardLtiMockAllowed(config.env);
  const store = createStore();
  const keys = createRotatingKeySet();
  let server = null;
  let origin = '';

  const platform = {
    config,
    store,
    keys,
    handler: null,
    get origin() {
      return origin;
    },
    async listen(port = 0, host = '127.0.0.1') {
      server = createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      const address = server.address();
      origin = `http://${host}:${address.port}`;
      platform.handler = createMockHandler({
        config,
        store,
        keys,
        listenOrigin: origin,
      });
      server.on('request', platform.handler);
      return {
        origin,
        port: address.port,
        close: () => platform.close(),
      };
    },
    close() {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.closeAllConnections?.();
        server.close(() => resolve());
        server = null;
      });
    },
  };
  return platform;
}

if (isDirectExecution(import.meta.url)) {
  const platform = createBlackboardLtiPlatform();
  const port = Number(process.env.BLACKBOARD_LTI_MOCK_PORT || process.env.PORT || 9473);
  const host = process.env.BLACKBOARD_LTI_MOCK_HOST || '0.0.0.0';
  const { origin } = await platform.listen(port, host);
  console.log(`Blackboard LTI mock listening on ${origin}`);
  console.log(`Dev panel: ${origin}/`);
  console.log(`JWKS: ${origin}/api/v1/management/applications/${platform.config.clientId}/jwks.json`);
  console.log(`OIDC auth: ${origin}/api/v1/gateway/oidcauth`);
  console.log(`Token: ${origin}/api/v1/gateway/oauth2/jwttoken`);
}
