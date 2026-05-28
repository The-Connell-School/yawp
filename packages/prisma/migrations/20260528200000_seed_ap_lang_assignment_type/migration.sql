-- Seed the AP English Language & Composition AssignmentType.
-- System-owned (no ownerOrgId or ownerTeacherId), same pattern as Free Write.
INSERT INTO "AssignmentType" (
    "id",
    "createdAt",
    "updatedAt",
    "title",
    "description",
    "position",
    "kind"
) VALUES (
    'caplangenglish00000000000',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'AP English Language & Composition',
    'Three essay types from the AP English Language & Composition exam: Synthesis, Rhetorical Analysis, and Argument. Scored using the College Board''s 6-point additive rubric (Thesis, Evidence & Commentary, Sophistication).',
    100,
    'ap-lang'
) ON CONFLICT ("id") DO NOTHING;

-- The AP tutor is soft-phase coaching, not a rigid instruction chain. This
-- single module is the session container; the essay-type-specific coaching
-- comes from the system prompt (built from the assignment's tutorContext),
-- not from static module instructions.
INSERT INTO "AssignmentModule" (
    "id",
    "createdAt",
    "updatedAt",
    "title",
    "position",
    "description",
    "isSelfGuided",
    "assignmentTypeId"
) VALUES (
    'caplangcoaching0000000000',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'Writing Coach',
    1,
    'Work through your essay with a coach who knows the AP rubric.',
    false,
    'caplangenglish00000000000'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AssignmentModuleInstruction" (
    "id",
    "createdAt",
    "updatedAt",
    "position",
    "title",
    "prompt",
    "showChatButton",
    "showNextButton",
    "assignmentModuleId"
) VALUES (
    'caplangcoachintro00000000',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    1,
    'Get started',
    'Let''s work on your essay together. Read the prompt and any sources, then tell me your first thoughts — or ask me where to start.',
    true,
    false,
    'caplangcoaching0000000000'
) ON CONFLICT ("id") DO NOTHING;
