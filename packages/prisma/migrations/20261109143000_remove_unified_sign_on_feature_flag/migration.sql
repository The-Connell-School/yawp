-- Unified sign-on shipped for everyone (Nov 2026). Retired flag rows are unused.

DELETE FROM "Setting"
WHERE name IN (
  'feature_flag.unified-sign-on',
  'feature_flag.signon-teacher-prompts'
);
