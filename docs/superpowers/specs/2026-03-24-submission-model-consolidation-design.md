# Submission Model Consolidation

Consolidate `DocumentSnapshot` + `Grade` into a single `Submission` model. Enable multiple submissions per document, auto-save grading, and assignment copy-to-multiple-classes.

## Context

The current system has two separate models for what is conceptually one thing:

- `DocumentSnapshot` captures the document at submission time (title, text, html)
- `Grade` captures the teacher's evaluation (scores, feedback, rubric, release status)

These are always 1:1 in practice. Merging them into `Submission` simplifies the data model, enables multiple submissions per document, and creates a cleaner mental model: a Submission is a paper turned in by a student that a teacher then grades and releases.

## Data Model

### Submission

```prisma
model Submission {
  id                String              @id @default(cuid())
  createdAt         DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime            @default(now()) @db.Timestamptz(6)

  // Snapshot data (captured at submit time, immutable after creation)
  title             String
  text              String
  html              String
  submittedAt       DateTime            @db.Timestamptz(6)

  // Grading data (filled in by teacher, auto-saved on blur)
  score             String?
  feedback          String?
  rubricScores      Json?
  overallScore      Int?
  overallComment    String?
  numericPercentage Int?
  letterGrade       String?
  grammarIssues     Json?
  promptConfig      Json?
  aiMeta            Json?
  gradedAt          DateTime?           @db.Timestamptz(6)
  gradedById        String?
  gradedBy          Profile?            @relation(fields: [gradedById], references: [id], onDelete: Cascade)

  // Release
  releasedAt        DateTime?           @db.Timestamptz(6)

  // Relations
  documentId        String
  document          Document            @relation(fields: [documentId], references: [id], onDelete: Restrict)
  comments          SubmissionComment[]

  @@index([documentId, submittedAt(sort: Desc)])
  @@index([gradedById])
  @@index([releasedAt])
}
```

### SubmissionComment

```prisma
model SubmissionComment {
  id           String     @id @default(cuid())
  createdAt    DateTime   @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime   @default(now()) @db.Timestamptz(6)
  content      String
  excerpt      String?
  occurrence   Int        @default(1)
  submissionId String
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  profileId    String
  profile      Profile    @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([submissionId, createdAt(sort: Desc)])
  @@index([profileId])
}
```

### Document changes

```prisma
model Document {
  // NEW relation
  submissions  Submission[]

  // LEGACY fields (stop writing, keep for backwards compat during migration)
  submittedAt          DateTime?
  submittedSnapshotId  String?
  submittedSnapshot    DocumentSnapshot?
}
```

### Removed models (in Phase 3)

- `GradeCommentResponse` — no responses to submission comments
- `GradeComment` — replaced by `SubmissionComment`
- `Grade` — replaced by `Submission`
- `DocumentSnapshot` — evaluate if still needed for non-submission version history

## Submission Lifecycle

A Submission progresses through three states:

1. **Submitted** — `submittedAt` set, all grading fields null. Student has turned in their paper.
2. **Graded** — `gradedAt` and `gradedById` set, scores/feedback filled in. Teacher has evaluated.
3. **Released** — `releasedAt` set. Student can see the feedback and scores.

Students never see the "Graded" state. From their perspective, a submission is either "Submitted" (awaiting feedback) or "Released" (feedback available).

## Document-Submission Relationship

A Document is a living, editable workspace. It is never "locked" by submission. Students can:

1. Write in their document
2. Submit (creates Submission #1 — snapshot of current state)
3. Continue editing the document
4. Submit again (creates Submission #2 — new snapshot)
5. Repeat as needed

Each Submission is an independent grading unit. The teacher grades and releases each one separately.

### Teacher dashboard tab mapping

| Tab | Query |
|-----|-------|
| In Progress | Documents with zero submissions |
| Submitted | Submissions where `gradedAt` is null |
| Graded | Submissions where `gradedAt` set, `releasedAt` null |
| Released | Submissions where `releasedAt` set |

## Auto-Save Grading

All grading fields save automatically — no save button.

### Behavior

- Each field saves independently on blur
- Text fields (feedback, comments) also debounce at ~1-2 seconds after typing stops, with save on blur as fallback
- A single API endpoint handles all saves: `POST /api/domain/update-submission`
- Frontend shows "Saving..." / "Saved" indicator (same pattern as document title saving)

### Endpoint

```
POST /api/domain/update-submission
{
  submissionId: string
  // Any subset of grading fields:
  score?: string
  feedback?: string
  rubricScores?: Json
  overallScore?: number
  overallComment?: string
  numericPercentage?: number
  letterGrade?: string
  grammarIssues?: Json
  aiMeta?: Json
}
```

### `gradedAt` / `gradedById`

Set automatically on the first update that includes any grading data. Subsequent saves update `updatedAt` but don't change `gradedAt`. "Graded" means "a teacher has touched this."

## Grading Assistant (AI Grading)

The AI grading flow stays the same, relabeled as "Grading Assistant" in all user-facing UI.

1. Teacher opens a submission, clicks "Grading Assistant"
2. Frontend calls the AI grading endpoint with submission text + prompt config
3. AI returns rubric scores, overall comment, grammar issues
4. Frontend receives response and **immediately auto-saves** to the submission via `update-submission` (with `aiMeta` tracking AI origin)
5. Teacher reviews, can edit any field, each edit auto-saves on blur
6. No separate "Save" step

The AI grading logic (LLM calls, rubric processing, grammar detection) is unchanged.

## Assignment Copy-to-Multiple-Classes

### Current state

A teacher creates an assignment within a single class. Assignment belongs to one Class + one StudentCourse. No schema change needed.

### New flow

1. Teacher creates an assignment from a class page (Assignments tab)
2. Form shows: title, prompt, tutor context, due date, student course — same as today
3. **New:** Multi-select for "Assign to classes" showing all classes where the selected StudentCourse is allowed (via `ClassStudentCourse`). Current class pre-selected.
4. On submit, backend creates one `Assignment` record per selected class with identical field values
5. Each copy is fully independent after creation — editing one doesn't affect others

### Class list filtering

The multi-select only shows classes where:
- The teacher is assigned to the class
- The selected StudentCourse is allowed in that class (exists in `ClassStudentCourse`)

## JSON Field Shapes

All four JSON fields are kept as `Json?` (Postgres jsonb). Rationale: the primary analysis use case (tracking student progress across submissions) is an application-layer + AI workflow that loads a handful of submissions per student and processes them in code — not a SQL aggregation pattern.

### rubricScores

```json
{
  "categoryName": {
    "score": 4,
    "comment": "Strong use of evidence...",
    "weight": 0.25,
    "isAi": true
  }
}
```

### grammarIssues

```json
[
  {
    "excerpt": "their going to...",
    "kind": "error",
    "rule": 7,
    "message": "Use 'they're' (they are) instead of 'their' (possessive)"
  }
]
```

### promptConfig

Snapshot of the rubric/grading configuration used at grading time. Shape varies by config.

### aiMeta

```json
{
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "inputTokens": 1500,
  "outputTokens": 800,
  "durationMs": 3200
}
```

## Migration Strategy: Expand and Contract

### Phase 1: Expand (add new tables, dual-write)

1. Create `Submission` and `SubmissionComment` tables via Prisma migration
2. Update submit-document flow to write to both `DocumentSnapshot` + `Submission`
3. Update grade-essay flow to write to both `Grade` + `Submission`
4. Update release-grades flow to write `releasedAt` to both `Grade` + `Submission`
5. Write a backfill script: create `Submission` records from existing `DocumentSnapshot` + `Grade` pairs

End of Phase 1: every submission exists in both old and new tables. All writes go to both.

### Phase 2: Migrate reads

Switch reads from old tables to new, route by route:

- Teacher dashboard tabs → query `Submission`
- Graded view → read from `Submission` (keep old route with redirect)
- Grade comments sidebar → read from `SubmissionComment`
- AI grading → read/write against `Submission`
- Student dashboard grade badges → check `Submission.releasedAt`

Each route migrates independently. Old routes keep working until switched.

### Phase 3: Contract (remove old tables)

Once all reads are migrated:

1. Stop dual-writing to old tables
2. Remove `document.submittedAt` and `document.submittedSnapshotId` columns
3. Drop `GradeCommentResponse` table
4. Drop `GradeComment` table
5. Drop `Grade` table
6. Evaluate whether `DocumentSnapshot` still needed for version history — if not, drop

### Ordering principle

Each phase is independently deployable. Stopping after Phase 1 means everything works with redundant data. Stopping after Phase 2 means old tables are dead weight but harmless.

### Route/URL transitions

- `/app/graded/:gradeId` — keep working during transition, eventually redirect to `/app/submissions/:submissionId`
- API routes like `api.domain.grade-essay` — keep route paths, change internal writes
- E2E tests update as each route migrates
