/**
 * Demo database resets drop yawp_demo entirely. Intern tester feedback must survive
 * those resets without relying on the full-database pre-reset dump.
 */

export const DEMO_TESTER_FEEDBACK_FALLBACK_EMAIL = 'dev.admin@yawp.local';

export const TESTER_FEEDBACK_EXPORT_SQL = `
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
        tf.screenshot,
        tf.environment,
        tf."createdAt"
      FROM "TesterFeedback" tf
      LEFT JOIN "User" u ON u.id = tf."userId"
      ORDER BY tf."createdAt", tf.id
    ) payload
  ),
  '[]'::json
)::text;
`.trim();

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

export function buildTesterFeedbackRestoreSql(rows) {
  if (!Array.isArray(rows)) {
    throw new Error('Tester feedback backup must be a JSON array');
  }
  if (rows.length === 0) {
    return 'SELECT 0 AS restored_rows;';
  }

  const payload = JSON.stringify(rows);
  if (payload.includes('$data$')) {
    throw new Error('Tester feedback backup contains unsupported delimiter');
  }

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

WITH incoming AS (
  SELECT *
  FROM jsonb_to_recordset($data$${payload}$data$) AS row_data(
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
    screenshot text,
    environment text,
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
  screenshot,
  environment,
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
  incoming.screenshot,
  incoming.environment,
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
  screenshot = EXCLUDED.screenshot,
  environment = EXCLUDED.environment,
  "createdAt" = EXCLUDED."createdAt";

SELECT count(*) AS restored_rows FROM "TesterFeedback";
COMMIT;
`.trim();
}
