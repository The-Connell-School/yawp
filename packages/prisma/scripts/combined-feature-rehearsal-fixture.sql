\set ON_ERROR_STOP on

-- Apply after 20260710130000_add_reporter_growth_plan and before the hardening
-- migrations. The repeated prompt and fourth attempt exercise the legacy
-- writing-position backfill and quarantine path.
INSERT INTO "Organization" ("id", "name")
VALUES
  ('rehearsal-org-a', 'Rehearsal Organization A'),
  ('rehearsal-org-b', 'Rehearsal Organization B');

INSERT INTO "User" ("id", "email", "name")
VALUES
  ('rehearsal-user-teacher-a', 'teacher-a@rehearsal.invalid', 'Teacher A'),
  ('rehearsal-user-student-a', 'student-a@rehearsal.invalid', 'Student A'),
  ('rehearsal-user-teacher-b', 'teacher-b@rehearsal.invalid', 'Teacher B'),
  ('rehearsal-user-student-b', 'student-b@rehearsal.invalid', 'Student B');

INSERT INTO "OrgMembership" (
  "id", "organizationId", "userId", "role"
)
VALUES
  (
    'rehearsal-teacher-a',
    'rehearsal-org-a',
    'rehearsal-user-teacher-a',
    'TEACHER'
  ),
  (
    'rehearsal-student-a',
    'rehearsal-org-a',
    'rehearsal-user-student-a',
    'STUDENT'
  ),
  (
    'rehearsal-teacher-b',
    'rehearsal-org-b',
    'rehearsal-user-teacher-b',
    'TEACHER'
  ),
  (
    'rehearsal-student-b',
    'rehearsal-org-b',
    'rehearsal-user-student-b',
    'STUDENT'
  );

INSERT INTO "School" ("id", "name", "code", "organizationId")
VALUES
  ('rehearsal-school-a', 'Rehearsal School A', 'REH-A', 'rehearsal-org-a'),
  ('rehearsal-school-b', 'Rehearsal School B', 'REH-B', 'rehearsal-org-b');

INSERT INTO "Class" (
  "id", "period", "grade", "schoolId", "schoolYear", "code", "title"
)
VALUES
  (
    'rehearsal-class-a',
    '1',
    '10',
    'rehearsal-school-a',
    '2026-2027',
    'REH-CLASS-A',
    'Rehearsal Class A'
  ),
  (
    'rehearsal-class-b',
    '2',
    '10',
    'rehearsal-school-b',
    '2026-2027',
    'REH-CLASS-B',
    'Rehearsal Class B'
  );

INSERT INTO "AssignmentType" ("id", "title", "position")
VALUES ('rehearsal-assignment-type', 'Rehearsal Essay', 99001);

INSERT INTO "Assignment" (
  "id", "assignmentTypeId", "title", "prompt"
)
VALUES (
  'rehearsal-assignment',
  'rehearsal-assignment-type',
  'Rehearsal Assignment',
  'Write a rehearsal response.'
);

INSERT INTO "ClassAssignment" (
  "id", "assignmentId", "classId"
)
VALUES (
  'rehearsal-class-assignment',
  'rehearsal-assignment',
  'rehearsal-class-a'
);

INSERT INTO "WritingPracticeAssignment" (
  "id",
  "title",
  "lessonSlugs",
  "problemCount",
  "createdByMembershipId"
)
VALUES (
  'rehearsal-writing-assignment',
  'Rehearsal Writing Practice',
  ARRAY['fixing-comma-splices'],
  3,
  'rehearsal-teacher-a'
);

INSERT INTO "WritingPracticeClassAssignment" (
  "id", "assignmentId", "classId"
)
VALUES (
  'rehearsal-writing-deployment',
  'rehearsal-writing-assignment',
  'rehearsal-class-a'
);

INSERT INTO "WritingPracticeAttempt" (
  "id",
  "createdAt",
  "classAssignmentId",
  "membershipId",
  "lessonSlug",
  "promptId",
  "exercise",
  "instruction",
  "response",
  "status",
  "feedbackJson"
)
VALUES
  (
    'rehearsal-attempt-1',
    '2026-07-20T10:00:01Z',
    'rehearsal-writing-deployment',
    'rehearsal-student-a',
    'fixing-comma-splices',
    'repeated-prompt',
    'Exercise one',
    'Fix it',
    'Response one',
    'strong',
    '{}'::jsonb
  ),
  (
    'rehearsal-attempt-2',
    '2026-07-20T10:00:02Z',
    'rehearsal-writing-deployment',
    'rehearsal-student-a',
    'fixing-comma-splices',
    'second-prompt',
    'Exercise two',
    'Fix it',
    'Response two',
    'developing',
    '{}'::jsonb
  ),
  (
    'rehearsal-attempt-3',
    '2026-07-20T10:00:03Z',
    'rehearsal-writing-deployment',
    'rehearsal-student-a',
    'fixing-comma-splices',
    'repeated-prompt',
    'Exercise three',
    'Fix it',
    'Response three',
    'strong',
    '{}'::jsonb
  ),
  (
    'rehearsal-attempt-4',
    '2026-07-20T10:00:04Z',
    'rehearsal-writing-deployment',
    'rehearsal-student-a',
    'fixing-comma-splices',
    'overflow-prompt',
    'Exercise four',
    'Fix it',
    'Response four',
    'needs_revision',
    '{}'::jsonb
  );

INSERT INTO "WritingPracticePromptSet" (
  "id", "classAssignmentId", "membershipId", "source", "promptsJson"
)
VALUES (
  'rehearsal-prompt-set',
  'rehearsal-writing-deployment',
  'rehearsal-student-a',
  'generated',
  '[]'::jsonb
);

INSERT INTO "ClassAssignmentInsight" (
  "id",
  "updatedAt",
  "classAssignmentId",
  "status",
  "submissionCount",
  "summaryJson",
  "generatedByMembershipId"
)
VALUES (
  'rehearsal-class-insight',
  CURRENT_TIMESTAMP,
  'rehearsal-class-assignment',
  'ready',
  1,
  '{"overview":"Rehearsal"}'::jsonb,
  'rehearsal-teacher-a'
);

INSERT INTO "ReporterConversation" (
  "id", "title", "membershipId", "organizationId"
)
VALUES (
  'rehearsal-conversation',
  'Rehearsal Conversation',
  'rehearsal-teacher-a',
  'rehearsal-org-a'
);

INSERT INTO "ReporterGrowthPlan" (
  "id",
  "status",
  "focus",
  "targetSkills",
  "body",
  "baseline",
  "membershipId",
  "organizationId",
  "studentMembershipId"
)
VALUES (
  'rehearsal-growth-plan',
  'active',
  'Rehearsal focus',
  '["evidence"]'::jsonb,
  'Rehearsal plan',
  '{"score":2}'::jsonb,
  'rehearsal-teacher-a',
  'rehearsal-org-a',
  'rehearsal-student-a'
);
