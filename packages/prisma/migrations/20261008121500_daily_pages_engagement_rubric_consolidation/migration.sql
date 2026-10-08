-- Daily Pages engagement rubric v2 (Brian Connell 2026-10-02)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Rubric" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "Rubric_archivedAt_idx" ON "Rubric"("archivedAt");

CREATE TABLE IF NOT EXISTS "InternalDpEngagementRubricRestore" (
  "rubricId" TEXT PRIMARY KEY REFERENCES "Rubric"("id") ON DELETE CASCADE,
  "previousSchemaJson" JSONB NOT NULL,
  "previousCurrentRevisionId" TEXT,
  "dailyPagesTypePreviousRubricId" TEXT,
  "sjpTypePreviousRubricId" TEXT,
  "archivedShortFormRubricId" TEXT,
  "archivedReflectionRubricId" TEXT,
  "restoredAt" TIMESTAMPTZ(6)
);

ALTER TABLE "InternalDpEngagementRubricRestore"
  ADD COLUMN IF NOT EXISTS "dailyPagesTypePreviousRubricId" TEXT;
ALTER TABLE "InternalDpEngagementRubricRestore"
  ADD COLUMN IF NOT EXISTS "sjpTypePreviousRubricId" TEXT;

DO $$
DECLARE
  engagement_id TEXT := 'cmsvqo8lf002801l60o74x8wr';
  daily_pages_type_id TEXT := 'cmlgtyo8j01em0qjs6knw7cni';
  sjp_daily_pages_type_id TEXT := 'cmtk7cy2r017y01l8r5ix4kxf';
  short_form_id TEXT := 'cmumlbxru000001jn1cjqkham';
  reflection_id TEXT := 'cmtuonqfw000101l3ntnz78sj';
  v2_schema JSONB := '{"name":"daily-pages-engagement","title":"Daily Pages engagement","scoringScale":{"type":"rubric_points","minScore":0,"maxScore":100,"step":1,"compositeMin":0,"compositeMax":100},"rubric":{"categories":[{"key":"engagement_with_prompt","label":"Engagement with Prompt","weight":1,"description":"Measures engagement — the student''s willingness to show up, put real thoughts on the page, and build a relationship with writing. Does not measure grammar, spelling, syntax, organization, polish, or the correctness of the content.","scoreLabels":[{"value":0,"label":"Not Present"},{"value":79,"label":"Needs More"},{"value":89,"label":"Good"},{"value":100,"label":"Excellent"}],"bands":[{"min":0,"max":69,"label":"Not Present","description":"Not enough on the page to evaluate against the tiers.\n\n• Top of the band — something genuinely submitted and attempted, but not enough there to evaluate against Needs More or higher.\n• Middle — a fragment. A few words, an unfinished sentence, an answer that stops.\n• 0 — blank, or nothing submitted.\n\nThis band is wide because it does two jobs. Place within it by asking whether any attempt was made, never whether the work is good.\n\nA student who wrote two honest sentences and stopped is meaningfully different from one who submitted an empty document. The band is wide enough to say so; use it.\n\nConfigured band for a 100-point assignment: 0–69."},{"min":70,"max":79,"label":"Needs More","description":"Token effort: a line or two, a restated prompt, \"I don''t know,\" or off-task filler. Something was submitted, but no real attempt was made.\n\nWithin the band: upper end when there is a fragment of a real attempt buried in it — a student who started and gave up is further along than one who never started. Lower end for a restated prompt or pure filler.\n\nConfigured band for a 100-point assignment: 70–79."},{"min":80,"max":89,"label":"Good","description":"The student completed it, but at the surface: generic statements, minimal development, the motions without the mind. Also lands here: genuine writing that ignores the prompt — real engagement with the page, but not with the topic. (Feedback credits the writing warmly, then redirects: \"Next time, aim this energy at the prompt.\")\n\nWithin the band: upper end when something genuine flickers through — one real specific, one honest sentence, a thought that starts to go somewhere before it stops. Middle for a clean, ordinary completion. Lower end when it is motion only, or when the writing is real but lands nowhere near the prompt.\n\nConfigured band for a 100-point assignment: 80–89."},{"min":100,"max":100,"label":"Excellent","description":"The student genuinely engaged with the day''s prompt. Real thoughts, specific details, a mind visibly at work on the page — they took the prompt somewhere. Depth beats length: a brief entry full of real thinking earns full credit, and a long one earns it too. Rough writing, typos, and rambling are completely irrelevant.\n\nScore: always the full total. There is no \"within the band\" here. If the engagement is real but you find yourself wanting to take a point off, that is the signal to look again: either it is all in and gets everything, or it is a strong Good and gets the top of that band.\n\nConfigured band for a 100-point assignment: 100."}],"feedbackEnabled":false,"grammarHighlighting":false}]},"promptConfig":{"gradingInstructions":"What this measures: engagement — the student''s willingness to show up, put real thoughts on the page, and build a relationship with writing. What this never measures: grammar, spelling, syntax, organization, polish, or the correctness of the content. Daily Pages is low-stakes practice; messiness is welcome and expected.\n\nThe teacher sets the point total — any whole number from 5 up. The tier is the judgment; the band is only resolution within it. Choose the tier first (Excellent, Good, Needs More, Not Present), then assign a whole-number score inside that tier''s band for that total. Excellent is always the full total only.\n\nGrading Assistant Instructions\nAnchor your read in the day''s prompt. When the assignment''s prompt is available to you, judge engagement with that prompt: did the student actually take it up, wrestle with it, respond to what it asked? The prompt is your reference point for the Excellent vs. Good line and for spotting off-prompt writing. If no prompt text is available, judge engagement with the act of writing itself.\nChoose the tier first, then the number. The tier is the real judgment; the band exists only so that a strong Good and a barely-there one don''t receive an identical score. Use the Within the band guidance under each tier. Whole numbers only, and never outside the band — a score is either in this tier or it belongs in the next one.\nExcellent is the full total, every time. Never 28 of 30, never 95 of 100. If you are not prepared to give every point, the tier is Good.\nNever mention grammar, spelling, syntax, or organization — not in the score, not in the feedback. Not even as a gentle aside.\nNever evaluate whether the content is correct. You measure engagement only. If a teacher is looking for something specific in the responses, that is the teacher''s read to make, not yours.\nFeedback is 1–3 warm sentences, in the producer''s voice: name one real thing the student said and respond to it like a human who actually read it (\"The detail about your grandmother''s kitchen — that''s the good stuff\"). At most one nudge. No audits, no checklists, no category breakdowns.\nIf an entry appears pasted or wildly unlike the student''s own register, don''t penalize on suspicion — score what''s on the page and add a brief note for the teacher.\nReport the point value, never a percentage. Schools use different grading scales; a percentage asserts a conversion the platform doesn''t get to make.\nThe teacher can adjust any tier, score, or comment. Nothing is final until the teacher reviews it."},"outputSchema":{"responseShape":"categories_overall_comment","schemaVersion":1,"assignmentPointScaling":"daily_pages_engagement_v2"},"calibrationNotes":null}'::jsonb;
  rub_row RECORD;
  dp_prev_rubric TEXT;
  sjp_prev_rubric TEXT;
  v1_id TEXT := 'dp-engagement-library-v1-capture';
  fp TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Rubric" WHERE id = engagement_id) THEN
    RAISE NOTICE 'Skipping DP engagement v2: library rubric % not found', engagement_id;
    RETURN;
  END IF;

  SELECT id, "schemaJson", "currentRevisionId" INTO rub_row
  FROM "Rubric" WHERE id = engagement_id;

  IF rub_row."schemaJson"->'outputSchema' ? 'teacherNotesEnabled' THEN
    v2_schema := jsonb_set(
      v2_schema,
      '{outputSchema,teacherNotesEnabled}',
      rub_row."schemaJson"->'outputSchema'->'teacherNotesEnabled',
      true
    );
  END IF;

  SELECT "rubricId" INTO dp_prev_rubric FROM "AssignmentType" WHERE id = daily_pages_type_id;
  SELECT "rubricId" INTO sjp_prev_rubric FROM "AssignmentType" WHERE id = sjp_daily_pages_type_id;

  INSERT INTO "InternalDpEngagementRubricRestore" (
    "rubricId", "previousSchemaJson", "previousCurrentRevisionId",
    "dailyPagesTypePreviousRubricId", "sjpTypePreviousRubricId",
    "archivedShortFormRubricId", "archivedReflectionRubricId"
  ) VALUES (
    engagement_id, rub_row."schemaJson", rub_row."currentRevisionId",
    dp_prev_rubric, sjp_prev_rubric,
    short_form_id, reflection_id
  )
  ON CONFLICT ("rubricId") DO NOTHING;

  INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId", "selectedRevisionId", "reason")
  SELECT a.id, a."rubricRevisionId", 'dp_engagement_v2_pre_publish'
  FROM "Assignment" a
  WHERE a."rubricRevisionId" IS NOT NULL
    AND a."assignmentTypeId" IN (daily_pages_type_id, sjp_daily_pages_type_id)
  ON CONFLICT ("assignmentId") DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "RubricRevision" WHERE "rubricName" = 'daily-pages-engagement'
  ) THEN
    fp := encode(sha256(convert_to(canonical_json(rub_row."schemaJson"), 'UTF8')), 'hex');
    INSERT INTO "RubricRevision" (
      "id", "rubricName", "version", "schemaJson", "fingerprint",
      "requestId", "requestHash", "createdBy", "reason"
    ) VALUES (
      v1_id, 'daily-pages-engagement', 1, rub_row."schemaJson", fp,
      'dp-engagement-library-v1-capture', fp,
      'migration-dp-engagement-v2', 'Capture pre-Brian library schema as v1'
    )
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  IF (rub_row."schemaJson"->'outputSchema'->>'assignmentPointScaling' IS DISTINCT FROM 'daily_pages_engagement_v2') THEN
    PERFORM set_config('yawp.rubric_revision_actor', 'migration-dp-engagement-v2', true);
    PERFORM set_config('yawp.rubric_revision_reason', 'Brian 2026-10-02 merged Daily Pages rubric', true);
    IF NOT EXISTS (
      SELECT 1 FROM "RubricRevision" WHERE "requestId" = 'brian-dp-rubric-2026-10-02'
    ) THEN
      PERFORM set_config('yawp.rubric_revision_request_id', 'brian-dp-rubric-2026-10-02', true);
    ELSE
      PERFORM set_config(
        'yawp.rubric_revision_request_id',
        'brian-dp-rubric-2026-10-02-reapply-' || substr(md5(random()::text), 1, 12),
        true
      );
    END IF;

    UPDATE "Rubric"
    SET "schemaJson" = v2_schema, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = engagement_id;
  END IF;

  UPDATE "Rubric"
  SET "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
  WHERE id IN (short_form_id, reflection_id)
     OR name IN ('daily-pages-short-form', 'daily-pages-reflection');

  UPDATE "AssignmentType"
  SET "rubricId" = engagement_id, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = daily_pages_type_id
    AND "rubricId" IS NULL
    AND EXISTS (SELECT 1 FROM "AssignmentType" WHERE id = daily_pages_type_id AND kind = 'daily_pages');

  UPDATE "AssignmentType"
  SET "rubricId" = engagement_id, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = sjp_daily_pages_type_id
    AND "rubricId" IS NULL
    AND EXISTS (SELECT 1 FROM "AssignmentType" WHERE id = sjp_daily_pages_type_id);
END $$;
