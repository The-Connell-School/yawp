# AI Evaluation Benchmarks Design

Date: 2026-06-24; assignment-type ownership clarified 2026-07-13
Status: Proposed plan with first controlled prompt-inspection slice implemented
Owner: Yawp product/engineering

## July 13 Product Decision: Evaluation Is Assignment-Type-Owned

There is no universal Yawp benchmark. An evaluation only has meaning inside one
assignment type because that assignment type owns the rubric, scoring scale,
grading instructions, tutor modules, and rubric relationships that define good
behavior.

Each assignment type has two separate evaluation targets:

1. **Grading assistant** — cases are submitted document examples. The target is
   evaluated on rubric-grounded scoring and feedback.
2. **Tutor** — cases are student-document and conversation scenarios. The target
   is evaluated on coaching behavior, rubric alignment, and instructional
   boundaries.

Each target owns its own evaluation suite, cases, criteria, runs, and results.
Cases and criteria can be customized within that assignment type. They are not
shared as universal rules. Reusable examples may be copied into another
assignment type, but the copied case becomes part of the receiving assignment
type's suite and must be approved in that context.

The admin experience should remain intentionally controlled and minimal. The
first slice exposes the saved grading-assistant instructions and the compiled
primary model request from the assignment type editor. Case libraries, run-one,
run-all, automated evaluation, and tutor evaluation remain follow-on slices.

## Ubiquitous Language

Use these terms consistently in code, product copy, and handoff documents:

| Term | Meaning |
| --- | --- |
| **Assignment Type** | The educational contract that owns the rubric, scoring, grading behavior, tutor behavior, and both evaluation targets. |
| **Evaluation Target** | The AI behavior being tested inside an assignment type: either **Grading Assistant** or **Tutor**. |
| **Prompt Configuration** | The editable, assignment-type-owned instructions and safe settings used to build a target's request. |
| **Compiled Invocation** | The exact primary model request produced by production code from a prompt configuration plus case inputs: system message, messages, and generation settings. In UI copy, **Compiled prompt** is the shorter label. |
| **Evaluation Suite** | One assignment type's approved collection of cases and criteria for one evaluation target. |
| **Evaluation Case** | One named, repeatable scenario with inputs and expected behavior. A grading-assistant case's main input is a **Case Document**. |
| **Case Document** | The example student document or submission content used by a grading-assistant evaluation case. |
| **Evaluation Criterion** | One narrow rule describing what success means for a case, such as an exact schema check, score band, required behavior, or forbidden behavior. |
| **Evaluator** | The code check, human reviewer, or constrained model judge that applies one or more criteria. |
| **Evaluation Run** | An execution of one target and prompt/configuration version against one case or the full suite. |
| **Attempt** | One model execution for one case within a run. Repetitions create multiple attempts. |
| **Evaluation Result** | The recorded output and criterion judgments for an attempt: pass, fail, needs review, or blocked. |
| **Release Gate** | The assignment-type-level decision that summarizes approved results and determines whether a prompt/configuration change is safe to publish. |

Avoid using **benchmark** to mean a universal set of rules. When the word is
useful, it is shorthand for a specific assignment type's approved evaluation
suite and baseline run.

## Summary

Yawp needs an evaluation system for AI judgment, not just an audit log. The current assignment-type direction is right: the rubric is the source of truth, the tutor and grading assistant are two applications of that rubric, and every AI call should be traceable back to a specific assignment type configuration. The next step is to make that configuration versioned, testable, and comparable before it changes production behavior.

The recommended approach is:

1. Introduce immutable assignment type versions.
2. Store exact prompt/context snapshots for every AI call against those versions.
3. Build benchmark suites for grading, tutoring, grammar/syntax, rubric extraction, and teacher-training quality.
4. Compare draft assignment-type versions against the current published version before publishing.
5. Promote real production failures from `LlmLog` into benchmark cases.

This should start as internal admin tooling. It should not block teachers yet. It should give Bryant/Brian/product experts a concrete way to answer, "Did this prompt/rubric/module change make the AI better or worse?"

## Source Notes

Granola was requested as an input source for Bryant/Brian Yawp calls, but the Granola connector returned an expired-token/401 response during this planning pass. This plan is based on current repo state, prior local Yawp planning docs, and Bryant's stated product direction in this thread. Once Granola is reauthorized, reconcile this plan against the actual call notes before implementation.

External eval research used:

- OpenAI eval docs: https://platform.openai.com/docs/guides/evals
- Claude evaluation docs: https://docs.claude.com/en/docs/test-and-evaluate/define-success
- LangSmith evaluation concepts: https://docs.smith.langchain.com/evaluation
- Promptfoo docs: https://www.promptfoo.dev/docs/intro/

Local planning inputs:

- `docs/superpowers/plans/2026-06-22-ai-context-rubric-alignment.md`
- `docs/superpowers/plans/2026-06-23-assignment-type-rubric-tutor-alignment.md`
- `docs/superpowers/plans/2026-06-23-assignment-type-rubric-llm-transparency-finish.md`

## Product Intent

Yawp is not trying to build a generic AI essay grader. It is building a controlled writing instruction system where:

- A rubric defines the end state for a type of assignment.
- Tutor modules guide students toward that end state over time.
- The grading assistant evaluates final work against the same end state.
- Teachers can lightly configure assignment instances, but the core rubric/tutor/grading judgment remains governed by the assignment type.
- Internal experts need to see whether AI behavior matches the pedagogy.

The evaluation system should therefore measure whether the AI is aligned with Yawp's instructional judgment, not just whether the model output "sounds good."

## Design Principles

1. Version the educational contract.

   A rubric edit, module instruction edit, grading prompt edit, or model config edit changes the educational contract. Those changes need immutable versions so benchmarks can compare "current published" against "draft candidate."

2. Test assembled context before testing model quality.

   The first class of failures is deterministic: wrong document, stale rubric, missing module alignment, wrong grammar weight, or draft/submission mismatch. These should be caught with normal unit/integration tests before any live model eval runs.

3. Evaluate flows separately, then compare them together.

   Grading, tutoring, grammar/syntax checks, rubric extraction, and teacher-facing feedback need different benchmarks. Cross-flow consistency checks should then verify that the tutor and grading assistant are aiming at the same rubric.

4. Prefer narrow evaluators over vague AI judges.

   Use code checks and exact assertions whenever possible. Use LLM judges for constrained questions such as "Did the tutor give a final grade in a preparatory module?" rather than broad quality scoring.

5. Promote real failures into benchmarks.

   `LlmLog` audit traces should become a source of benchmark fixtures. When a teacher, student, or admin flags a bad AI interaction, that trace should become a reproducible test case.

6. Keep benchmarks private and expert-led at first.

   This is internal quality infrastructure. Teacher-visible benchmark summaries can come later, but the first version should optimize for product/engineering calibration.

## Core Architecture

### Assignment Type Versions

Add immutable assignment type versions as the backbone of AI evaluation and rollback.

Recommended model:

```text
AssignmentType
  currentPublishedVersionId
  draftVersionId
  title
  slug
  description
  lifecycle/status fields

AssignmentTypeVersion
  id
  assignmentTypeId
  versionNumber
  status: draft | published | archived
  parentVersionId
  rubricJson
  scoringScaleJson
  gradingPromptConfigJson
  gradingOutputSchemaJson
  gradingCalibrationNotes
  tutorModulesJson
  tutorModuleRubricAlignmentJson
  tutorBehaviorConfigJson
  modelConfigJson
  sourceHashesJson
  createdById
  createdAt
  publishedById
  publishedAt
  archivedAt
  rollbackOfVersionId
```

The version snapshot should contain the exact assignment-type AI configuration needed to replay a tutor or grading call. It can snapshot module data as JSON even if the editable draft still uses normalized relational tables. Benchmarking cares about reproducibility more than edit ergonomics.

### Version Pinning

Pin the assignment type version at the moment the user-facing flow begins:

- Assignment creation should pin `assignmentTypeVersionId` to the current published assignment type version.
- Tutor sessions/messages should use the assignment's pinned version.
- Submission grading should store the exact assignment type version used for that grading run.
- Regrades should explicitly choose either the originally pinned version or a newer version, and the choice should be logged.

This avoids silent drift where a student starts an assignment under one rubric but gets tutored or graded under another.

### Rollback And Rollforward

Rollback should not mutate old versions. It should:

1. Point `AssignmentType.currentPublishedVersionId` back to a prior version, or
2. Copy a prior version into a new draft, allow edits, and publish it as a new version.

Existing assignments should remain pinned to their existing version unless an admin intentionally migrates them.

### AI Context Snapshots

Every AI call that uses configurable assignment type context should store:

- `assignmentTypeId`
- `assignmentTypeVersionId`
- `assignmentId`
- `studentDocumentId` or `submissionId`
- document role: draft | submitted | graded submission | extracted prompt | benchmark fixture
- document content hash
- rubric hash
- module id and module alignment hash when applicable
- grading prompt/config hash when applicable
- model/provider/settings
- feature kind: tutor | grading | grammar | rubric-extract | teacher-feedback | benchmark
- source record ids for every context block

Raw prompt/messages can remain in `LlmLog.messages`. The normalized metadata should be searchable and safe to compare.

## Benchmark Layers

### 1. Deterministic Context Assembly Tests

These are normal tests that do not call an LLM. They should answer: "Are we sending the right thing?"

Required checks:

- Tutor response uses the assignment's pinned assignment type version.
- Tutor response includes only applicable module/rubric categories.
- Tutor response omits dead assignment-level tutor context.
- Tutor response distinguishes `primary`, `supporting`, `preparatory`, and `not-applicable` module relationships.
- Grading uses the submitted document, not the active draft.
- Regrade uses the intended submission snapshot.
- Grammar/syntax rubric weight is 10%, not 5%.
- Unlinked assignment types default to Thesis only when no assignment-type rubric/version exists.
- Rubric category ids/names/weights in prompt context exactly match the assignment type version.
- `LlmLog.metadata` includes hashes and source ids needed to audit the exact Anthropic/OpenAI context.

These tests should be the first implementation phase because they catch the highest-risk mistakes cheaply.

### 2. Offline Golden Benchmarks

Golden benchmarks are curated examples with expected behavior. They should run live model calls against a fixed assignment type version and fixture inputs.

Each benchmark case should include:

- input fixture text
- assignment prompt
- assignment type version id
- flow kind
- expected rubric/category behavior
- expected score range or band when grading
- required feedback traits
- forbidden feedback traits
- product-boundary assertions
- source/provenance
- expert reviewer
- train/dev/test split

Golden cases should be small at first: 10-20 high-signal Thesis cases are enough for the first useful benchmark. Add breadth after the workflow is trustworthy.

### 3. Candidate-Vs-Baseline Experiments

When an admin changes a rubric, module instruction, grading prompt, tutor behavior setting, or model config:

1. Treat the edited draft assignment type version as the candidate.
2. Run the same benchmark suite against the current published version and the candidate version.
3. Show aggregate deltas and case-level diffs.
4. Require an expert/admin decision before publishing risky changes.

This should be the main admin workflow: "Run benchmark against draft" rather than "hope this prompt edit works."

### 4. Production Monitoring And Trace Promotion

Use production `LlmLog` rows as quality signals:

- Add admin flagging for bad AI responses.
- Add lightweight teacher/student feedback signals where appropriate.
- Sample traces by assignment type version, flow, model, and outcome.
- Promote flagged or anomalous traces into benchmark cases.
- Keep a link from each benchmark case back to the originating `LlmLog` row.

This turns real failures into regression tests.

### 5. Human Calibration

Human review is needed because the product is making educational judgment calls.

Recommended workflow:

- Brian/product expert labels the first 20-50 benchmark cases.
- Engineering builds evaluators around those labels.
- LLM judges are tested against human labels before being trusted.
- Disagreements become review queues, not automatic failures.
- Periodically recalibrate after rubric or pedagogy changes.

## Benchmark Suite Types

### Grading Assistant Suite

Purpose: verify that final evaluation is anchored to the exact rubric and submitted document.

Case inputs:

- submitted essay text
- assignment prompt
- assignment type version snapshot
- rubric categories and scoring scale
- optional teacher strictness/config

Expected outputs:

- category scores or score bands
- total score/grade band
- required strengths
- required growth areas
- grammar/syntax expectations
- forbidden contradictions

Metrics:

- JSON/schema validity
- exact category key match
- score within expected category band
- weighted total within acceptable delta
- grammar/syntax applied at 10%
- feedback grounded in submitted text
- no hallucinated rubric categories
- no praise/penalty contradiction across categories
- no use of draft text when submission exists

Initial cases:

- strong thesis with weak evidence
- weak thesis with strong evidence
- fluent essay with no defensible thesis
- well-argued essay with grammar/syntax issues
- generic intro that should not be overpraised
- incomplete essay that should receive limited credit
- essay with evidence unrelated to thesis
- essay that changed between draft and submitted version

### Tutor Suite

Purpose: verify that the tutor helps students improve according to the module's relationship to the rubric without turning into a grader or ghostwriter.

Case inputs:

- current student draft
- student message
- assignment prompt
- module id/instructions
- module-to-rubric relationship map
- assignment type version snapshot

Expected outputs:

- coaching behavior appropriate to module stage
- references to applicable rubric categories
- no final grade unless the flow explicitly allows it
- no contradiction with grading rubric
- concrete next step for the student
- preservation of student voice

Metrics:

- module relationship correctness:
  - `primary`: directly coach/evaluate the category being taught
  - `supporting`: mention as a secondary lens
  - `preparatory`: scaffold without evaluating final mastery
  - `not-applicable`: omit from tutor reasoning/output
- no answer-writing for the student
- no generic praise detached from the rubric
- no conflict with grading expectations
- response uses the correct document hash
- response uses the correct assignment type version

Initial cases:

- student asks "is my intro good?" in a thesis-primary module
- student asks for a final score in a preparatory evidence module
- student asks the tutor to write the thesis for them
- draft has a strong thesis but weak organization
- draft has a generic opening that should be redirected constructively
- module marks grammar as not-applicable and tutor should not center grammar

### Grammar/Syntax Suite

Purpose: verify grammar/syntax feedback is useful, proportionate, and weighted correctly.

Case inputs:

- student text
- assignment type version
- grammar/syntax rubric category

Expected outputs:

- detected issues
- severity
- explanation
- suggested correction style
- contribution to rubric scoring where applicable

Metrics:

- grammar/syntax category weight is 10%
- true positive detection on known issues
- false positive avoidance on clean text
- no over-penalizing style choices as errors
- no contradiction with higher-order writing feedback

Initial cases:

- clean essay with no meaningful grammar issues
- essay with repeated comma splices
- essay with fragments that are rhetorically intentional
- essay with severe sentence-level issues but clear argument
- essay with one typo that should not dominate feedback

### Rubric Extraction/Copy Suite

Purpose: verify admin-created assignment types start with accurate rubric structure.

Case inputs:

- uploaded rubric text/PDF extraction output
- copied source assignment type rubric
- target assignment type draft

Expected outputs:

- categories
- weights
- scoring levels
- descriptors
- grammar/syntax category and weight

Metrics:

- no category loss
- no category duplication
- weights total correctly
- grammar/syntax remains 10%
- source rubric copy preserves values exactly unless intentionally edited
- extracted rubric is flagged for human review when confidence is low

### Teacher-Training Suite

Purpose: turn benchmark outputs into training material for teachers and internal calibration.

Case inputs:

- student essay
- AI grading output
- ideal expert feedback
- rubric version

Expected outputs:

- teacher-facing explanation of why the score/feedback is appropriate
- examples of strong vs weak feedback
- notes on common miscalibrations

Metrics:

- explanation aligns with expert rubric interpretation
- avoids vague "AI says so" reasoning
- teaches the rubric, not just the result
- highlights disagreements for review

This is not a first-release blocker, but it is strategically important. The same benchmark cases can become teacher onboarding examples later.

### Safety And Boundary Suite

Purpose: verify Yawp's academic integrity and product boundaries.

Case inputs:

- requests to write parts of the essay
- attempts to bypass assignment instructions
- sensitive student disclosures
- adversarial prompt injection in student text

Expected outputs:

- coaching without ghostwriting
- no leakage of hidden prompts
- no execution of student-supplied instructions as system instructions
- appropriate escalation language for sensitive content

Metrics:

- academic integrity compliance
- prompt injection resistance
- no hidden prompt disclosure
- no unsafe advice

## Evaluation Methods

### Code-Based Evaluators

Use first when possible.

Examples:

- output parses against schema
- rubric category ids exactly match expected ids
- no category weight drift
- required metadata exists
- source document hash equals fixture hash
- score is within numeric range
- forbidden phrase/category is absent

### Rule-Based Text Evaluators

Use for simple surface checks.

Examples:

- must mention the current module's primary rubric category
- must not include a final grade in a tutor response
- must not say grammar is 5%
- must not reference a category absent from the rubric

### LLM Judges

Use for constrained judgment. Do not use a generic "quality 1-10" judge as the primary gate.

Good judge questions:

- "Does the tutor preserve the student's voice rather than rewriting the paragraph?"
- "Does the grading feedback cite evidence from the submitted essay?"
- "Does the response evaluate final mastery even though this module is preparatory?"
- "Is the feedback aligned with the named rubric category?"

Judge outputs should be structured:

```json
{
  "pass": true,
  "severity": "none|minor|major|critical",
  "evidence": "short explanation",
  "rubricCategoryIds": ["thesis"]
}
```

### Human Review

Use for:

- initial golden case creation
- judge calibration
- ambiguous failures
- release decisions for major rubric/prompt changes

Human review should be stored as data, not comments in a doc.

### Pairwise Comparison

Use for candidate-vs-baseline changes where absolute scoring is hard.

Example:

- Run current published version and draft version on the same tutor case.
- Hide which output is which.
- Ask a human or calibrated judge which better follows Yawp's instructional goals.

Pairwise comparison is especially useful for tutor tone and usefulness.

### Multi-Run Stability

If a flow uses non-zero temperature, run important benchmark cases multiple times.

Track:

- score variance
- category variance
- feedback consistency
- critical failure rate

High variance should block publishing even when average quality looks good.

## Data Model Proposal

### `AiBenchmarkSuite`

```text
id
assignmentTypeId nullable
flowKind: grading | tutor | grammar | rubric_extract | teacher_training | safety
name
description
status: draft | active | archived
ownerId
thresholdsJson
createdAt
updatedAt
```

### `AiBenchmarkCase`

```text
id
suiteId
name
description
fixtureInputsJson
expectedOutputsJson
criteriaJson
tagsJson
difficulty
split: train | dev | test
sourceLlmLogId nullable
authorId
reviewerId nullable
reviewedAt nullable
createdAt
updatedAt
```

### `AiBenchmarkRun`

```text
id
suiteId
baselineAssignmentTypeVersionId nullable
candidateAssignmentTypeVersionId nullable
runType: manual | prepublish | scheduled | production_replay
status: queued | running | passed | warned | failed | canceled
modelProvider
modelName
modelConfigJson
aggregateMetricsJson
costCents
tokenUsageJson
startedById
startedAt
completedAt nullable
```

### `AiBenchmarkResult`

```text
id
runId
caseId
assignmentTypeVersionId
llmLogId nullable
rawOutputJson
parsedOutputJson
codeScoresJson
judgeScoresJson
humanReviewJson nullable
status: passed | warned | failed
severity
createdAt
```

### `AiBenchmarkHumanReview`

```text
id
resultId
reviewerId
decision: approve | reject | needs_discussion
notes
correctedExpectedOutputJson nullable
createdAt
```

## Admin UX

Assignment Type admin should eventually have these sections:

1. Rubric
2. Tutor Settings
3. Grading Assistant
4. Benchmarks
5. Versions

### Benchmarks Tab

Core views:

- benchmark suite list
- latest run status
- run draft vs published
- aggregate pass/warn/fail scorecard
- case-level failures
- side-by-side output comparison
- context snapshot diff
- promote `LlmLog` trace to benchmark case

### Versions Tab

Core views:

- current draft
- current published version
- version timeline
- changes since published
- publish action
- rollback action
- copy version to draft action
- benchmark status for each version

### Publish Flow

Recommended behavior:

1. Admin edits draft assignment type.
2. System records changes as a draft version.
3. Admin clicks "Run benchmarks."
4. System compares draft to current published version.
5. UI shows:
   - hard context test failures
   - benchmark deltas
   - high-risk failures
   - token/cost summary
6. Admin can publish if hard gates pass.
7. Override requires a reason for warning-level failures.

In the first implementation, this can be advisory rather than a hard product gate. It should still store the benchmark result with the published version.

## Release Plan

### Phase 0: Foundation Already In Motion

Current work already points in the right direction:

- assignment type owns rubric/grading/tutor configuration
- assignment-level tutor context is being removed
- module-level rubric relationships exist
- AI context audit metadata exists in `LlmLog`
- admin audit UI can inspect AI context logs

Do not add benchmarks until prompt/context assembly is stable enough to replay.

### Phase 1: Immutable Versions And Deterministic Tests

Deliverables:

- `AssignmentTypeVersion` model and migration
- assignment creation pins assignment type version
- tutor and grading flows resolve pinned version
- context builder functions accept an explicit version
- unit tests for all context assembly paths
- `LlmLog.metadata` stores assignment type version id and hashes

Exit criteria:

- no AI call using assignment type configuration can run without a version id
- deterministic tests prove exact rubric/document/module context
- old grading assistant template concept is fully migrated into assignment type versions

### Phase 2: Grading Benchmark MVP

Deliverables:

- benchmark suite/case/run/result models
- internal runner for grading assistant benchmarks
- seed 10-20 Thesis grading cases
- code evaluators for schema/category/weight/document hash checks
- basic numeric score band checks
- admin UI for latest grading benchmark run

Exit criteria:

- Bryant/Brian can compare draft vs published Thesis grading behavior
- grammar/syntax 10% behavior is benchmarked
- failures are inspectable with exact prompt/context snapshot

### Phase 3: Tutor Benchmark MVP

Deliverables:

- tutor benchmark runner
- seed 10-20 module-specific Thesis tutor cases
- evaluators for module relationship behavior
- pairwise candidate-vs-baseline comparison
- admin UI case diff for tutor outputs

Exit criteria:

- module relationships are tested with real student-message scenarios
- preparatory/supporting/primary behavior is observable
- tutor/grading contradiction cases can be reproduced

### Phase 4: Production Trace Promotion

Deliverables:

- flag bad AI response from admin audit
- promote `LlmLog` to benchmark case
- production sampling by assignment type version and flow
- online heuristic checks for severe failures

Exit criteria:

- real failures become regression cases
- benchmark suite grows from usage, not only hand-authored fixtures

### Phase 5: Pre-Publish Gates And Rollback Confidence

Deliverables:

- benchmark gate in publish flow
- warning override with reason
- version rollback UI
- scheduled model regression runs
- benchmark health dashboard

Exit criteria:

- risky prompt/rubric/model changes are tested before release
- rollback is operationally simple
- model upgrades can be evaluated before switching production

## First Test Inventory

Add these before implementing benchmark runners.

### Unit Tests

- `buildAssignmentTypeVersionSnapshot` preserves rubric, scoring scale, grading prompt, tutor modules, and module alignment.
- `resolveAssignmentTypeForAssignment` returns the pinned version, not the latest draft.
- tutor context builder includes the current module and correct module relationship map.
- tutor context builder omits `not-applicable` rubric categories.
- tutor context builder treats `preparatory` as scaffold-only.
- grading context builder uses submitted document snapshot.
- grading context builder includes rubric category weights exactly.
- grammar/syntax category weight resolves to 10%.
- unlinked/new assignment types default to Thesis only when no assignment-type version is configured.
- `LlmLog.metadata` includes source ids and hashes for every context block.

### Integration Tests

- creating an assignment pins current published assignment type version.
- publishing a new assignment type version does not change existing assignment tutor context.
- regrading can choose original version or latest version and logs the choice.
- admin edit creates/updates draft version without mutating published version.
- rollback changes current published pointer without deleting history.

### E2E Tests

- admin edits rubric, runs benchmark, sees draft-vs-published result.
- admin cannot publish when hard context gate fails.
- admin can override warning-level benchmark failure with a reason.
- admin opens AI context log and promotes it to a benchmark case.
- assignment type version timeline shows publish and rollback states.

### Live Eval Tests

Do not run live evals in normal CI by default. Run them manually, pre-publish, or scheduled with budget controls.

Live eval checks should store:

- model/provider/settings
- token usage
- cost estimate
- output variance
- raw prompt/context snapshot
- result metadata

## Recommended Defaults

Use these defaults unless product decides otherwise:

- First assignment type: Thesis.
- First benchmark suite: Thesis grading.
- First tutor suite: Thesis tutor module alignment.
- First human reviewers: Bryant and Brian/product expert.
- First live model benchmark size: 10-20 cases per suite.
- First pass/fail posture: advisory, except hard deterministic context failures.
- First publish gate: block only missing version id, wrong document hash, stale rubric hash, schema failure, grammar 5% regression, and hidden/dead assignment-level tutor context.
- First eval framework: build Yawp-native data model and runner, with optional export/import compatibility for promptfoo-style fixture files later.

## Why Native First

Promptfoo, LangSmith, and provider eval APIs are useful references, but Yawp should store benchmark cases and results in its own database first because:

- assignment type versions are product objects
- benchmark cases need links to rubrics, modules, submissions, and `LlmLog`
- admins need this inside the assignment type workflow
- teacher-training artifacts may grow from the same cases
- future rollback/publish decisions need durable local evidence

External eval tools can still be useful for local development or side experiments. They should not be the source of truth for assignment type quality.

## Risks

1. Benchmarks can overfit the product to a small golden set.

   Mitigation: keep train/dev/test splits, promote real production failures, and review aggregate failure themes rather than chasing one case at a time.

2. LLM judges can encode the same mistake as the product model.

   Mitigation: calibrate judges against human labels and keep narrow judge questions.

3. Versioning can slow down admin editing.

   Mitigation: keep draft editing ergonomic; only publish creates an immutable production contract.

4. Benchmark UI can become too complex too early.

   Mitigation: start with grading suite result pages and simple side-by-side diffs.

5. Live eval cost can grow.

   Mitigation: small default suites, manual runs first, scheduled runs later, cost/token summary on every run.

## Recommended Implementation Sequence

1. Finish assignment type rubric/tutor/grading consolidation.
2. Add immutable assignment type versions.
3. Pin assignment creation, tutor, grading, and regrading to versions.
4. Add deterministic context assembly tests and hard failure metadata.
5. Add benchmark data model.
6. Build grading benchmark MVP for Thesis.
7. Build tutor benchmark MVP for Thesis modules.
8. Add production trace promotion.
9. Add pre-publish benchmark workflow.
10. Add teacher-training/calibration views.

The key is sequencing: do not build live AI benchmarks before the system can prove which version, rubric, module, and document each AI call used.
