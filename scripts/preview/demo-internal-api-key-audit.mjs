import { DEMO_INTERNAL_API_SCOPE_SET } from './demo-internal-api-config.mjs';

/** Read-only audit of YAWP_INTERNAL_API_KEYS. Never prints secret values. */

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const KNOWN_FIELD_NAMES = new Set(['id', 'secret', 'scopes']);

export function sanitizeAuditId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : '<invalid>';
}

export function sanitizeAuditScope(value) {
  return typeof value === 'string' &&
    DEMO_INTERNAL_API_SCOPE_SET.has(value)
    ? value
    : '<invalid>';
}

export function formatAuditFields(key) {
  if (!key || typeof key !== 'object' || Array.isArray(key)) {
    return '<invalid>';
  }
  const names = Object.keys(key).sort();
  if (!names.length) {
    return '<invalid>';
  }
  const parts = [];
  let hasOther = false;
  for (const name of names) {
    if (KNOWN_FIELD_NAMES.has(name)) {
      parts.push(name);
    } else {
      hasOther = true;
    }
  }
  if (hasOther) {
    parts.push('<other>');
  }
  return parts.join(',');
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
  return {
    id: sanitizeAuditId(key.id),
    scopes,
    fields: formatAuditFields(key),
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
