export const E2E_UA_ORGANIZATION_ID = 'university-of-alabama-e2e';
export const E2E_UA_PARTNER_CODE = 'UA-E2E-2026';
export const E2E_APP_PORT = Number(process.env.E2E_PORT ?? 5173);
export const E2E_STRIPE_PORT = Number(
  process.env.E2E_STRIPE_PORT ??
    (process.env.E2E_PORT ? E2E_APP_PORT + 1 : 12111)
);
export const E2E_APP_ORIGIN = `http://127.0.0.1:${E2E_APP_PORT}`;
export const E2E_UA_APP_ORIGIN = `http://ua.localhost:${E2E_APP_PORT}`;
export const E2E_STRIPE_BASE_URL = `http://127.0.0.1:${E2E_STRIPE_PORT}`;
export const E2E_STRIPE_WEBHOOK_SECRET = 'whsec_e2e_not_a_real_secret';
