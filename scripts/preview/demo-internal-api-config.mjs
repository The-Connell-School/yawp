import { fileURLToPath } from 'node:url';

// Match internal-platform-auth.server.ts without importing application/database
// code into the deploy control path. Diagnostics must never include key material.
const scopes = new Set([
  'rubrics:read', 'rubrics:write', 'flags:read', 'flags:write',
  'stats:read', 'audit:read', 'management:read', 'management:write',
]);
const invalid = 'DEMO_INTERNAL_API_KEYS must contain valid, uniquely identified scoped keys including management:write';

export function demoInternalApiKeys(value, { required = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (required) throw new Error('DEMO_INTERNAL_API_KEYS is required for demo signed writes');
    return '';
  }
  try {
    const keys = JSON.parse(raw);
    if (!Array.isArray(keys) || !keys.length) throw new Error();
    const ids = new Set();
    for (const key of keys) {
      if (!key || typeof key !== 'object' || Array.isArray(key)
        || Object.keys(key).some(name => !['id', 'secret', 'scopes'].includes(name))
        || typeof key.id !== 'string' || !key.id.length || key.id.length > 64
        || typeof key.secret !== 'string' || key.secret.length < 32 || key.secret.length > 256
        || !Array.isArray(key.scopes) || !key.scopes.length
        || key.scopes.some(scope => !scopes.has(scope)) || ids.has(key.id)) throw new Error();
      ids.add(key.id);
    }
    if (!keys.some(key => key.scopes.includes('management:write'))) throw new Error();
    return raw;
  } catch {
    throw new Error(invalid);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    demoInternalApiKeys(process.env.DEMO_INTERNAL_API_KEYS, { required: true });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
