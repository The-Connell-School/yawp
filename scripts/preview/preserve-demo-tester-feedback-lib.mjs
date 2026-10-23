/**
 * Demo database resets drop yawp_demo entirely. Intern tester feedback must survive
 * those resets without relying on the full-database pre-reset dump.
 */

export const DEMO_TESTER_FEEDBACK_FALLBACK_EMAIL = 'dev.admin@yawp.local';

export const SCREENSHOT_COLUMN_PROBE_SQL = `
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'TesterFeedback'
    AND column_name = 'screenshot'
)::text;
`.trim();

export function buildTesterFeedbackExportSql(includeScreenshot) {
  const screenshotSelect = includeScreenshot ? '        tf.screenshot,\n' : '';
  return `
SELECT COALESCE(
  (
    SELECT json_agg(row_to_json(payload) ORDER BY payload."createdAt", payload.id)
    FROM (
      SELECT
        tf.id,
        tf."userId",
        u.email AS "reporterEmail",
        tf.url,
        tf."userAgent",
        tf."whatIDid",
        tf."whatHappened",
        tf."whatIWish",
        tf.severity,
        tf.actions,
${screenshotSelect}        tf.environment,
        tf."createdAt"
      FROM "TesterFeedback" tf
      LEFT JOIN "User" u ON u.id = tf."userId"
      ORDER BY tf."createdAt", tf.id
    ) payload
  ),
  '[]'::json
)::text;
`.trim();
}

/** @deprecated use buildTesterFeedbackExportSql */
export const TESTER_FEEDBACK_EXPORT_SQL = buildTesterFeedbackExportSql(true);

export function redactEmailForLogs(email) {
  if (!email || typeof email !== 'string') {
    return '[redacted]';
  }
  const at = email.indexOf('@');
  if (at <= 0) {
    return '[redacted]';
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const localHead = local.slice(0, 1) || '*';
  const domainParts = domain.split('.');
  const domainHead = domainParts[0]?.slice(0, 1) || '*';
  const domainTail = domainParts.length > 1 ? domainParts.slice(1).join('.') : '';
  return `${localHead}***@${domainHead}***${domainTail ? `.${domainTail}` : ''}`;
}

export function redactQuotedStrings(line) {
  return line
    .replace(/"([^"\\]|\\.)*"/g, '"<redacted>"')
    .replace(/'([^'\\]|\\.)*'/g, "'<redacted>'");
}

export function sanitizeCliFailure(label, stderr) {
  const lines = (stderr || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^DETAIL:/i.test(line) &&
        !/^HINT:/i.test(line) &&
        !/Failing row contains/i.test(line) &&
        !/^CONTEXT:/i.test(line)
    );
  let first = lines[0] || `${label} failed`;
  first = redactQuotedStrings(first);
  const sqlstate =
    (stderr || '').match(/SQLSTATE[: ]+([0-9A-Z]{5})/i)?.[1] ||
    (stderr || '').match(/ERROR:\s+([0-9A-Z]{5})\b/)?.[1];
  const compact = first.length > 240 ? `${first.slice(0, 240)}…` : first;
  return sqlstate ? `${compact} (SQLSTATE ${sqlstate})` : compact;
}

export function sanitizeJsonFailure(error) {
  if (!(error instanceof SyntaxError)) {
    return 'Tester feedback backup JSON is invalid';
  }
  return 'Tester feedback backup JSON is invalid';
}

function incomingRecordColumns(includeScreenshot) {
  const screenshotRecord = includeScreenshot ? '    screenshot text,\n' : '';
  const screenshotInsert = includeScreenshot ? '  screenshot,\n' : '';
  const screenshotSelect = includeScreenshot ? '  incoming.screenshot,\n' : '';
  const screenshotUpdate = includeScreenshot
    ? '  screenshot = EXCLUDED.screenshot,\n'
    : '';

  return { screenshotRecord, screenshotInsert, screenshotSelect, screenshotUpdate };
}

export function buildTesterFeedbackRestoreCopyPrefix() {
  return `
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE lower(email) = lower('${DEMO_TESTER_FEEDBACK_FALLBACK_EMAIL}')
  ) THEN
    RAISE EXCEPTION 'Cannot restore tester feedback without fallback user';
  END IF;
END $$;

CREATE TEMP TABLE _demo_tester_feedback_restore_b64 (
  payload text
) ON COMMIT DROP;

COPY _demo_tester_feedback_restore_b64 (payload) FROM STDIN WITH (FORMAT text);
`.trim();
}

export function buildTesterFeedbackRestoreCopySuffix(includeScreenshot) {
  const { screenshotRecord, screenshotInsert, screenshotSelect, screenshotUpdate } =
    incomingRecordColumns(includeScreenshot);

  return `
\\.
WITH decoded AS (
  SELECT convert_from(decode(string_agg(payload, ''), 'base64'), 'UTF8')::jsonb AS rows_json
  FROM _demo_tester_feedback_restore_b64
),
incoming AS (
  SELECT *
  FROM jsonb_to_recordset((SELECT rows_json FROM decoded)) AS row_data(
    id text,
    "userId" text,
    "reporterEmail" text,
    url text,
    "userAgent" text,
    "whatIDid" text,
    "whatHappened" text,
    "whatIWish" text,
    severity text,
    actions jsonb,
${screenshotRecord}    environment text,
    "createdAt" timestamptz
  )
),
fallback AS (
  SELECT id
  FROM "User"
  WHERE lower(email) = lower('${DEMO_TESTER_FEEDBACK_FALLBACK_EMAIL}')
  LIMIT 1
)
INSERT INTO "TesterFeedback" (
  id,
  "userId",
  url,
  "userAgent",
  "whatIDid",
  "whatHappened",
  "whatIWish",
  severity,
  actions,
${screenshotInsert}  environment,
  "createdAt"
)
SELECT
  incoming.id,
  COALESCE(reporter.id, fallback.id),
  incoming.url,
  incoming."userAgent",
  incoming."whatIDid",
  incoming."whatHappened",
  incoming."whatIWish",
  incoming.severity,
  incoming.actions,
${screenshotSelect}  incoming.environment,
  incoming."createdAt"
FROM incoming
LEFT JOIN "User" reporter
  ON lower(reporter.email) = lower(incoming."reporterEmail")
CROSS JOIN fallback
ON CONFLICT (id) DO UPDATE SET
  "userId" = EXCLUDED."userId",
  url = EXCLUDED.url,
  "userAgent" = EXCLUDED."userAgent",
  "whatIDid" = EXCLUDED."whatIDid",
  "whatHappened" = EXCLUDED."whatHappened",
  "whatIWish" = EXCLUDED."whatIWish",
  severity = EXCLUDED.severity,
  actions = EXCLUDED.actions,
${screenshotUpdate}  environment = EXCLUDED.environment,
  "createdAt" = EXCLUDED."createdAt";

SELECT count(*) AS restored_rows FROM "TesterFeedback";
COMMIT;
`.trim();
}

/** @deprecated streaming restore uses COPY + base64; kept for tests */
export function buildTesterFeedbackRestoreStreamParts(includeScreenshot) {
  return {
    prefix: buildTesterFeedbackRestoreCopyPrefix(),
    suffix: buildTesterFeedbackRestoreCopySuffix(includeScreenshot),
  };
}

export function buildTesterFeedbackRestoreSql(rows, includeScreenshot = true) {
  if (!Array.isArray(rows)) {
    throw new Error('Tester feedback backup must be a JSON array');
  }
  if (rows.length === 0) {
    return 'SELECT 0 AS restored_rows;';
  }

  const base64Payload = Buffer.from(JSON.stringify(rows), 'utf8').toString('base64');
  return `${buildTesterFeedbackRestoreCopyPrefix()}\n${base64Payload}\n${buildTesterFeedbackRestoreCopySuffix(includeScreenshot)}`;
}
