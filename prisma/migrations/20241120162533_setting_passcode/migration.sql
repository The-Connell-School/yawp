-- AlterTable
INSERT INTO "Setting" ("id", "createdAt", "updatedAt", "name", "value")
VALUES (
  lower(hex(randomblob(4))) || lower(hex(randomblob(2))) || '4' || substr(lower(hex(randomblob(2))), 2) || lower(hex(randomblob(6))),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'signup_passcode',
  ''
);
