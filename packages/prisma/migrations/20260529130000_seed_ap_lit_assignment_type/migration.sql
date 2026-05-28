-- Seed the AP English Literature & Composition AssignmentType.
-- Mirrors the AP Lang seed: system-owned, with a single "Writing Coach"
-- module as the chat container (coaching comes from the system prompt).
INSERT INTO "AssignmentType" (
    "id",
    "createdAt",
    "updatedAt",
    "title",
    "description",
    "position",
    "kind"
) VALUES (
    'caplitenglish000000000000',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'AP English Literature & Composition',
    'Three essay types from the AP English Literature & Composition exam: Poetry Analysis, Prose Fiction Analysis, and Literary Argument. Scored using the College Board''s 6-point additive rubric (Thesis, Evidence & Commentary, Sophistication).',
    101,
    'ap-lit'
) ON CONFLICT ("id") DO NOTHING;

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
    'caplitcoaching00000000000',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'Writing Coach',
    1,
    'Work through your essay with a coach who knows the AP rubric.',
    false,
    'caplitenglish000000000000'
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
    'caplitcoachintro000000000',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    1,
    'Get started',
    'Let''s work on your essay together. Read the prompt and the text closely, then tell me your first thoughts — or ask me where to start.',
    true,
    false,
    'caplitcoaching00000000000'
) ON CONFLICT ("id") DO NOTHING;
