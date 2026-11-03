-- GALS Claims Grading Assistant (Brian Connell 2026-11-02)
SET lock_timeout = '5s';

INSERT INTO "Rubric" ("id", "createdAt", "updatedAt", "name", "title", "schemaJson")
SELECT gen_random_uuid()::text, NOW(), NOW(), 'gals-claims', 'GALS Claims', '{"name":"gals-claims","title":"GALS Claims","scoringScale":{"type":"points_scale","minScore":0,"maxScore":1},"rubric":{"categories":[{"key":"my_claim","label":"My claim","weight":1,"description":"The one sentence the student wrote after \"My claim:\". Excellent means the claim (1) answers the whole question, including both parts when the question has two parts, (2) is one complete sentence that says who or what it is about and what they do or are, and (3) states what the student thinks — an answer someone could disagree with, not the question repeated or a bare fact. Needs Some Improvement means one or more checks are missing, or there is no claim yet. Spelling, capital letters, and punctuation do not change the band when a reader can understand the claim.","scoreLabels":[{"value":0,"label":"Needs Some Improvement"},{"value":1,"label":"Excellent"}],"feedbackEnabled":false,"grammarHighlighting":false}]},"promptConfig":{"gradingInstructions":"You are grading a GALS Claims assignment: super low stakes. The student was asked to write one sentence after the label \"My claim:\".\n\nGrade only that claim sentence. Ignore everything else in the submission, including setup sentences, reasons, or labels other than \"My claim:\".\n\nWhen grading context includes the extracted claim sentence, treat that text as the only evidence. When no claim is present, score Needs Some Improvement.\n\nUse exactly two bands:\n- 1, Excellent: the claim does all three checks — answers the whole question (both parts if the question has two parts); is one complete sentence about who or what and what they do or are; says what the student thinks (disagreeable, not the question repeated or a bare fact).\n- 0, Needs Some Improvement: missing one or more checks, or no claim yet.\n\nSpelling, capital letters, and punctuation do not change the band if a reader can understand the claim.\n\nAnchor your read in the assignment prompt when it is available: the claim should answer that question.\n\nGrading Assistant instructions\nWrite feedback the student can read on their own: about a 3rd to 5th grade reading level, short sentences, everyday words, plain text.\n\nIf Excellent: celebrate exactly what they did. Name the check they did best. You may add one small spelling or punctuation tip. Keep it under three sentences.\n\nIf Needs Some Improvement: start with one true thing that is working. Then name the ONE most important thing to fix, using the check order above (whole question, then one complete sentence, then disagreeable opinion). Say what is missing and why. Give one clear next step. Never rewrite the claim for them. Fix one thing only, even if more than one check is missing.\n\nNever mention points, scores, or grades. Never mention a student''s learning needs."},"outputSchema":{"responseShape":"categories_overall_comment","schemaVersion":1},"calibrationNotes":"GALS Claims (Brian 2026-11-02): grade only the sentence after My claim: on Excellent vs Needs Some Improvement."}
'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "Rubric" WHERE "name" = 'gals-claims');

-- Link Brian's live Production Claims assignment type to the built-in kind.
UPDATE "AssignmentType" AS at
SET
  "kind" = 'gals_claims',
  "rubricId" = (SELECT "id" FROM "Rubric" WHERE "name" = 'gals-claims' LIMIT 1),
  "rubricJson" = NULL,
  "scoringScaleJson" = NULL,
  "gradingPromptConfigJson" = NULL,
  "gradingOutputSchemaJson" = NULL,
  "gradingCalibrationNotes" = NULL,
  "gradingAssistantVersion" = GREATEST(at."gradingAssistantVersion", 1) + 1,
  "updatedAt" = NOW()
WHERE at."kind" IS DISTINCT FROM 'gals_claims'
  AND lower(trim(at."title")) IN ('claims', 'claims assignment')
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentType" other
    WHERE other."kind" = 'gals_claims'
      AND other."id" <> at."id"
  );
