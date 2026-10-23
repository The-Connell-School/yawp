import { fileURLToPath } from 'node:url';

/** Read-only audit of YAWP_INTERNAL_API_KEYS inside the demo web container. Never prints secrets. */

export function auditInternalApiKeys(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { count: 0, entries: [] };
  }
  let keys;
  try {
    keys = JSON.parse(trimmed);
  } catch (error) {
    const name = error instanceof Error ? error.constructor.name : 'Error';
    return { parseError: name };
  }
  if (!Array.isArray(keys)) {
    return { parseError: 'TypeError' };
  }
  const entries = [];
  for (const key of keys) {
    if (!key || typeof key !== 'object' || Array.isArray(key)) {
      return { parseError: 'TypeError' };
    }
    entries.push({
      id: typeof key.id === 'string' ? key.id : String(key.id ?? ''),
      scopes: Array.isArray(key.scopes) ? key.scopes.map(String) : [],
      fields: Object.keys(key).sort(),
    });
  }
  return { count: entries.length, entries };
}

export function formatDemoInternalApiKeyAudit(result) {
  if ('parseError' in result) {
    return `PARSE_ERROR ${result.parseError}`;
  }
  const lines = [`count=${result.count}`];
  for (const entry of result.entries) {
    lines.push(
      `entry\t${entry.id}\t${JSON.stringify(entry.scopes)}\t${entry.fields.join(',')}`
    );
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const formatted = formatDemoInternalApiKeyAudit(
    auditInternalApiKeys(process.env.YAWP_INTERNAL_API_KEYS)
  );
  console.log(formatted);
}
