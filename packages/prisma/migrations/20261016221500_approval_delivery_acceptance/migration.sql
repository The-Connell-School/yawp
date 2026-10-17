ALTER TABLE "FreeTierApprovalDelivery"
  ADD COLUMN "acceptedReminderCount" INTEGER,
  ADD COLUMN "acceptedNextAutoReminderAt" TIMESTAMPTZ(6);

-- Existing accepted slots retain their original result, rather than the current
-- approval counter/cadence. Manual sends preserve the preceding weekly slot.
UPDATE "FreeTierApprovalDelivery" AS delivery
SET "acceptedReminderCount" = delivery."sequence",
    "acceptedNextAutoReminderAt" = CASE
      WHEN delivery."sequence" >= 4 THEN NULL
      WHEN approval."firstSentAt" IS NULL THEN NULL
      ELSE approval."firstSentAt" + INTERVAL '7 days' * (
        1 + COALESCE(FLOOR(EXTRACT(EPOCH FROM (
          (SELECT MAX(previous."sentAt") FROM "FreeTierApprovalDelivery" previous
           WHERE previous."approvalId" = delivery."approvalId"
             AND previous."kind" = 'admin_reminder'
             AND previous."source" = 'auto' AND previous."state" = 'SENT'
             AND previous."sentAt" <= delivery."sentAt") - approval."firstSentAt"
        )) / 604800), 0)
      )
    END
FROM "FreeTierAdminApproval" AS approval
WHERE delivery."approvalId" = approval."id"
  AND delivery."kind" = 'admin_reminder' AND delivery."state" = 'SENT';
