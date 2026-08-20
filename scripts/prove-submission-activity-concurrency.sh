#!/usr/bin/env bash
set -euo pipefail

proof_url="${1:?Pass the isolated PostgreSQL URL}"
case "$proof_url" in
  postgresql://*@127.0.0.1:*/*) ;;
  *)
    echo "Refusing concurrency proof outside isolated local PostgreSQL." >&2
    exit 1
    ;;
esac

proof_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$proof_dir"
}
trap cleanup EXIT

psql "$proof_url" --no-psqlrc --set ON_ERROR_STOP=on <<'SQL'
INSERT INTO "Organization" (id, name)
VALUES
  ('activity-concurrency-org', 'Activity Concurrency Proof'),
  ('activity-concurrency-other-org', 'Activity Concurrency Other');
INSERT INTO "User" (id, email, name)
VALUES
  ('activity-concurrency-owner', 'activity-concurrency-owner@example.test', 'Proof Owner'),
  ('activity-concurrency-other', 'activity-concurrency-other@example.test', 'Other Owner');
INSERT INTO "OrgMembership" (id, "userId", "organizationId", role)
VALUES
  ('activity-concurrency-owner-membership', 'activity-concurrency-owner', 'activity-concurrency-org', 'STUDENT'),
  ('activity-concurrency-other-membership', 'activity-concurrency-other', 'activity-concurrency-other-org', 'STUDENT');
INSERT INTO "AssignmentType" (id, title, position)
VALUES ('activity-concurrency-assignment-type', 'Concurrency Proof', 999998);
INSERT INTO "Document" (id, title, text, html, "membershipId", "assignmentTypeId")
VALUES (
  'activity-concurrency-document', 'Concurrency Proof', 'Proof', '<p>Proof</p>',
  'activity-concurrency-owner-membership', 'activity-concurrency-assignment-type'
), (
  'activity-concurrency-other-document', 'Other Tenant Concurrency Proof',
  'Other proof', '<p>Other proof</p>',
  'activity-concurrency-other-membership', 'activity-concurrency-assignment-type'
);
INSERT INTO "Submission" (id, title, text, html, "submittedAt", "documentId")
VALUES (
  'activity-concurrency-submission', 'Concurrency Proof', 'Proof', '<p>Proof</p>',
  CURRENT_TIMESTAMP, 'activity-concurrency-document'
);
SQL

run_race() {
  local activity_id="$1"
  local update_sql="$2"
  local expected_error="$3"
  local fifo="$proof_dir/$activity_id.fifo"
  local session_log="$proof_dir/$activity_id.session.log"
  local update_log="$proof_dir/$activity_id.update.log"

  mkfifo "$fifo"
  psql "$proof_url" --no-psqlrc --set ON_ERROR_STOP=on \
    < "$fifo" > "$session_log" 2>&1 &
  local session_pid=$!
  exec 3>"$fifo"
  printf '%s\n' \
    'BEGIN;' \
    "INSERT INTO \"SubmissionActivity\" (id, \"submissionId\", \"organizationId\", \"actorType\", \"eventType\", source, changes) VALUES ('$activity_id', 'activity-concurrency-submission', 'activity-concurrency-org', 'system', 'submission.grade_updated', 'db-proof', '{}'::jsonb);" \
    '\echo ACTIVITY_LOCKED' >&3

  for _ in {1..100}; do
    grep -q 'ACTIVITY_LOCKED' "$session_log" && break
    sleep 0.05
  done
  grep -q 'ACTIVITY_LOCKED' "$session_log"

  set +e
  psql "$proof_url" --no-psqlrc --set ON_ERROR_STOP=on \
    --command "$update_sql" > "$update_log" 2>&1 &
  local update_pid=$!
  set -e
  sleep 0.2
  printf '%s\n' 'COMMIT;' '\q' >&3
  exec 3>&-
  wait "$session_pid"

  set +e
  wait "$update_pid"
  local update_status=$?
  set -e
  if [[ "$update_status" -eq 0 ]]; then
    cat "$update_log"
    echo "Concurrent tenant reassignment unexpectedly committed." >&2
    exit 1
  fi
  grep -q "$expected_error" "$update_log"

  psql "$proof_url" --no-psqlrc --set ON_ERROR_STOP=on \
    --command "BEGIN; SET LOCAL yawp.submission_activity_cleanup = 'on'; DELETE FROM \"SubmissionActivity\" WHERE id = '$activity_id'; COMMIT;" >/dev/null
}

run_race \
  'submission-activity-owner-race-proof' \
  'UPDATE "OrgMembership" SET "organizationId" = '\''activity-concurrency-other-org'\'' WHERE id = '\''activity-concurrency-owner-membership'\'';' \
  'durable activity'

run_race \
  'submission-activity-document-race-proof' \
  'UPDATE "Document" SET "membershipId" = '\''activity-concurrency-other-membership'\'' WHERE id = '\''activity-concurrency-document'\'';' \
  'durable submission activity'

run_race \
  'submission-activity-submission-document-race-proof' \
  'UPDATE "Submission" SET "documentId" = '\''activity-concurrency-other-document'\'' WHERE id = '\''activity-concurrency-submission'\'';' \
  'audited submission'

psql "$proof_url" --no-psqlrc --set ON_ERROR_STOP=on <<'SQL'
INSERT INTO "SubmissionActivity" (
  id, "submissionId", "organizationId", "actorType", "eventType", source, changes
) VALUES (
  'activity-immutable-route-row', 'activity-concurrency-submission',
  'activity-concurrency-org', 'system', 'submission.grade_updated',
  'update-submission', '{}'::jsonb
);

DO $$
BEGIN
  BEGIN
    UPDATE "SubmissionActivity"
    SET "eventType" = 'submission.comment_deleted'
    WHERE id = 'activity-immutable-route-row';
    RAISE EXCEPTION 'ordinary activity update unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM "SubmissionActivity"
    WHERE id = 'activity-immutable-route-row';
    RAISE EXCEPTION 'ordinary activity delete unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "SubmissionActivity"
    WHERE id = 'activity-immutable-route-row'
  ) THEN
    RAISE EXCEPTION 'failed ordinary delete did not preserve activity';
  END IF;
END $$;
SQL

echo "Two-session tenant-anchor serialization and immutable-ledger proof passed."
