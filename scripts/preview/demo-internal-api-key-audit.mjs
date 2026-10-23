import { DEMO_INTERNAL_API_SCOPE_SET } from './demo-internal-api-config.mjs';

/** Read-only audit of YAWP_INTERNAL_API_KEYS. Never prints secret values. */

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const FIELD_NAME_PATTERN = /^[A-Za-z0-9_]{1,40}$/;

export function sanitizeAuditId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : '<invalid>';
}

export function sanitizeAuditScope(value) {
  return typeof value === 'string' &&
    DEMO_INTERNAL_API_SCOPE_SET.has(value)
    ? value
    : '<invalid>';
}

export function sanitizeAuditFieldName(name) {
  return FIELD_NAME_PATTERN.test(name) ? name : '<invalid>';
}

export function sanitizeAuditEntry(key) {
  if (!key || typeof key !== 'object' || Array.isArray(key)) {
    return {
      id: '<invalid>',
      scopes: ['<invalid>'],
      fields: '<invalid>',
    };
  }
  const scopes = Array.isArray(key.scopes)
    ? key.scopes.map((scope) => sanitizeAuditScope(scope))
    : ['<invalid>'];
  const fieldNames = Object.keys(key)
    .sort()
    .map((name) => sanitizeAuditFieldName(name));
  return {
    id: sanitizeAuditId(key.id),
    scopes,
    fields: fieldNames.length ? fieldNames.join(',') : '<invalid>',
  };
}

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
  const entries = keys.map((key) => sanitizeAuditEntry(key));
  return { count: entries.length, entries };
}

export function formatDemoInternalApiKeyAudit(result) {
  if ('parseError' in result) {
    return `PARSE_ERROR ${result.parseError}`;
  }
  const lines = [`count=${result.count}`];
  for (const entry of result.entries) {
    lines.push(
      `entry\t${entry.id}\t${JSON.stringify(entry.scopes)}\t${entry.fields}`
    );
  }
  return lines.join('\n');
}
