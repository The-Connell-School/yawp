SET lock_timeout = '5s';

-- Retire the stock four-band Exit Ticket rubric (Brian, 2026-11-17).
--
-- Grading now assembles one of two assistants in code (Reflection, or Check
-- for understanding). A row that saved the stock bands would win over that
-- code and run the old rubric alongside it. Clearing the stock rubric, scale,
-- and prompt lets the code default through. Assignments, already-recorded
-- scores, and a rubric an admin actually replaced are left alone.
--
-- This does not run against production by itself. It runs when migrations run.

UPDATE "AssignmentType"
SET
  "scoringScaleJson" = NULL,
  "rubricJson" = NULL,
  "gradingPromptConfigJson" = CASE
    WHEN jsonb_typeof("gradingPromptConfigJson"->'systemMessageTemplate') = 'string'
      AND jsonb_typeof("gradingPromptConfigJson"->'userMessageTemplate') = 'string'
    THEN jsonb_build_object(
      'systemMessageTemplate', "gradingPromptConfigJson"->'systemMessageTemplate',
      'userMessageTemplate', "gradingPromptConfigJson"->'userMessageTemplate'
    )
    ELSE NULL
  END,
  "gradingCalibrationNotes" = 'Exit Ticket grading assistant (2026-11-17): Reflection is full credit or none; Check for understanding is full, partial, or none. The four-band rubric is retired.',
  "updatedAt" = NOW()
WHERE
  "kind" = 'exit_ticket'
  AND "rubricJson" #>> '{categories,0,key}' = 'understanding'
  AND "rubricJson" #>> '{categories,0,bands,0,label}' = 'No evidence'
  AND "rubricJson" #>> '{categories,0,bands,3,label}' = 'Explains it';
