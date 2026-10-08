export const E2E_UA_ORGANIZATION_ID = 'university-of-alabama-e2e';
export const E2E_UA_PARTNER_CODE = 'UA-E2E-2026';
export const E2E_STRIPE_PORT = 12111;
export const E2E_STRIPE_BASE_URL = `http://127.0.0.1:${E2E_STRIPE_PORT}`;
export const E2E_STRIPE_WEBHOOK_SECRET = 'whsec_e2e_not_a_real_secret';

// The app server under test. 5173 stays the default; a Record execution capsule
// hands each workspace its own port (RECORD_PORT_E2E) so parallel capsules do
// not fight over one dev server.
function e2ePort() {
  const raw = process.env.E2E_PORT || process.env.RECORD_PORT_E2E || '5173';
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`E2E_PORT must be a TCP port, got "${raw}"`);
  }
  return port;
}
export const E2E_PORT = e2ePort();
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_UA_APP_ORIGIN = `http://ua.localhost:${E2E_PORT}`;
