\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  rejected INTEGER := 0;
  proof_failure CONSTANT TEXT := 'tenant negative proof unexpectedly succeeded';
  assignment_tenant TEXT;
  creator_id TEXT;
BEGIN
  BEGIN
    INSERT INTO "WritingPracticeClassAssignment" (
      "id", "assignmentId", "classId"
    ) VALUES (
      'rehearsal-invalid-deployment',
      'rehearsal-writing-assignment',
      'rehearsal-class-b'
    );
    RAISE EXCEPTION '%: writing deployment', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected cross-tenant deployment: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO "WritingPracticeAttempt" (
      "id",
      "classAssignmentId",
      "membershipId",
      "position",
      "countsTowardProgress",
      "lessonSlug",
      "promptId",
      "exercise",
      "instruction",
      "response",
      "status",
      "feedbackJson"
    ) VALUES (
      'rehearsal-invalid-attempt',
      'rehearsal-writing-deployment',
      'rehearsal-student-b',
      1,
      true,
      'fixing-comma-splices',
      'invalid-attempt',
      'Invalid',
      'Invalid',
      'Invalid',
      'strong',
      '{}'::jsonb
    );
    RAISE EXCEPTION '%: writing attempt', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected cross-tenant attempt: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO "WritingPracticePromptSet" (
      "id", "classAssignmentId", "membershipId", "source", "promptsJson"
    ) VALUES (
      'rehearsal-invalid-prompt-set',
      'rehearsal-writing-deployment',
      'rehearsal-student-b',
      'generated',
      '[]'::jsonb
    );
    RAISE EXCEPTION '%: writing prompt set', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected cross-tenant prompt set: %', SQLERRM;
  END;

  BEGIN
    UPDATE "ClassAssignmentInsight"
    SET "generatedByMembershipId" = 'rehearsal-teacher-b'
    WHERE "id" = 'rehearsal-class-insight';
    RAISE EXCEPTION '%: class insight', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected cross-tenant class insight: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO "WritingPracticeAssignment" (
      "id",
      "organizationId",
      "title",
      "lessonSlugs",
      "problemCount",
      "createdByMembershipId"
    ) VALUES (
      'rehearsal-invalid-assignment',
      'rehearsal-org-a',
      'Invalid assignment',
      ARRAY['fixing-comma-splices'],
      1,
      'rehearsal-teacher-b'
    );
    RAISE EXCEPTION '%: writing assignment creator', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected cross-tenant assignment creator: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO "AiRequestReservation" (
      "id", "feature", "membershipId", "organizationId"
    ) VALUES (
      'rehearsal-invalid-reservation',
      'rehearsal',
      'rehearsal-teacher-b',
      'rehearsal-org-a'
    );
    RAISE EXCEPTION '%: AI reservation', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected cross-tenant AI reservation: %', SQLERRM;
  END;

  DELETE FROM "OrgMembership" WHERE "id" = 'rehearsal-teacher-a';
  SELECT "organizationId", "createdByMembershipId"
    INTO assignment_tenant, creator_id
  FROM "WritingPracticeAssignment"
  WHERE "id" = 'rehearsal-writing-assignment';
  IF assignment_tenant <> 'rehearsal-org-a' OR creator_id IS NOT NULL THEN
    RAISE EXCEPTION 'owner deletion did not preserve the assignment tenant';
  END IF;

  BEGIN
    INSERT INTO "WritingPracticeClassAssignment" (
      "id", "assignmentId", "classId"
    ) VALUES (
      'rehearsal-ownerless-invalid-deployment',
      'rehearsal-writing-assignment',
      'rehearsal-class-b'
    );
    RAISE EXCEPTION '%: ownerless writing deployment', proof_failure;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE proof_failure || '%' THEN RAISE; END IF;
    rejected := rejected + 1;
    RAISE NOTICE 'rejected ownerless cross-tenant deployment: %', SQLERRM;
  END;

  IF rejected <> 7 THEN
    RAISE EXCEPTION 'expected 7 tenant rejections, observed %', rejected;
  END IF;

  RAISE NOTICE 'tenant negative proof passed with % rejected writes', rejected;
END $$;

ROLLBACK;
