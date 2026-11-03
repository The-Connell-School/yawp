import { redactEmailForLog } from './redact-email-for-log.server';

const MAX_QUERY_SNIPPET_LENGTH = 180;

function collapseWhitespace(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function redactSqlLiterals(query: string): string {
  let out = query.replace(/'(?:[^'\\]|\\.)*'/g, "'[redacted]'");
  out = out.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, (email) =>
    redactEmailForLog(email),
  );
  return out;
}

function queryVerb(query: string): string {
  const match = query.match(
    /^(SELECT|INSERT|UPDATE|DELETE|WITH|BEGIN|COMMIT|ROLLBACK)/i,
  );
  return match ? match[1]!.toUpperCase() : 'QUERY';
}

function referencedTables(query: string): string[] {
  const tables = new Set<string>();
  for (const match of query.matchAll(/"(?:public"\.)?"([A-Z][A-Za-z0-9_]*)"/g)) {
    tables.add(match[1]!);
  }
  return [...tables].slice(0, 4);
}

/** Safe one-line summary for slow Prisma query logs — no raw literals or full SQL dumps. */
export function summarizePrismaQueryForLog(rawQuery: string): string {
  const query = collapseWhitespace(rawQuery);
  const verb = queryVerb(query);
  const tables = referencedTables(query);
  const paramCount = new Set(query.match(/\$\d+/g) ?? []).size;

  const label = [
    verb,
    ...(tables.length ? [tables.join('+')] : []),
    ...(paramCount ? [`${paramCount}p`] : []),
  ].join(' ');

  const snippet = redactSqlLiterals(query);
  const trimmedSnippet =
    snippet.length > MAX_QUERY_SNIPPET_LENGTH
      ? `${snippet.slice(0, MAX_QUERY_SNIPPET_LENGTH)}…`
      : snippet;

  return `${label} | ${trimmedSnippet}`;
}
