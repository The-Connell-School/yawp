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
