# Build Yawp's AI Evaluation Workbench

## Role

Act as the senior engineer responsible for turning Yawp's tutor, grading assistant, and writing practice grader into versioned, testable AI systems. Work backend first. Prove the architecture and evaluation loop before building UI. Keep the first UI deliberately small.

This is not a generic prompt playground. It is an internal quality system for answering a specific product question:

> If we change a rubric, prompt, model, strictness setting, tutor module, or writing-practice grading rule, can we prove that student and teacher outcomes did not regress before the change affects production?

## Workspace

- WS workspace: `TheConnellSchool/yawp/ai-evals`
- Workspace root: `/Users/bryantbrock/Workspaces/TheConnellSchool/yawp/ai-evals`
- Repository: `/Users/bryantbrock/Workspaces/TheConnellSchool/yawp/ai-evals/yawp`
- Branch: `ws/ai-evals`
- Branch base: current GitHub `main` at `13cd496a`
- Do not use the older checkout at `/Users/bryantbrock/brocksoftware/TheConnellSchool/yawp` for implementation. It contains unrelated assignment-feedback work.

Read `AGENTS.md` before changing code. Follow its TDD, backward-compatibility, feature-flag, dual-write, commit, and no-push rules. Set up this worktree with `bash scripts/worktree-local-setup.sh` before running the app.

## CEO/Product Direction

Last week focused on unblocking Kevin and getting the new Yawp surfaces into a demoable state. This week's Bryant-focus lane is AI quality infrastructure.

Yawp has three distinct AI product flows that need a common evaluation foundation:

1. Tutor
   - Coaches a student through assignment modules.
   - Uses the current document, conversation, assignment context, module instructions, step instructions, and module-to-rubric relationships.
   - Must guide without ghostwriting, avoid contradicting the grading assistant, and adjust to the student's needs.

2. Grading assistant
   - Helps teachers grade a submitted document against the assignment type rubric.
   - Uses the submission snapshot, assignment type grading instructions, scoring scale, strictness level, and output schema.
   - Must be reproducible, rubric-grounded, schema-valid, and stable enough to support future model or prompt changes.

3. Writing practice grader
   - Evaluates focused writing exercises such as comma splices, wordiness, transitions, agreement, and sentence construction.
   - Must accept more than one valid student revision, avoid false positives, explain the relevant rule, and give a useful next step.
   - The current `main` implementation is only a client-side prototype score. It is not yet a production AI grader.

Bryant needs an internal admin workflow attached to an assignment type. The assignment type is the educational contract and currently owns the rubric, grading assistant details, tutor modules, and rubric relationships. An admin should be able to edit a draft prompt/configuration, run its benchmark cases, compare it with the published baseline, inspect failures, and decide whether the candidate remains acceptable.

The UI comes last. Do not overbuild it. The important work is making the backend versioned, replayable, measurable, and shared with production code.

## Granola Evidence

Use these meeting notes as product evidence, not optional background:

### June 17: Thesis-driven essay grading - rubric alignment and tutor consistency

Granola meeting ID: `3345918a-9f6e-40a7-8c04-cdd5585f2d70`

- Conflicting general and step-level tutor instructions caused false feedback.
- The tutor and grading assistant must never contradict each other.
- The rubric is the source of truth for both systems.
- Each tutor module should receive only the relevant rubric-aligned guidance.
- Exact document/context sent to AI on every message must be auditable.
- Writing practice should support AI-scored, effectively non-duplicative exercises.

### June 22: Assignment builder and grading assistant - alignment and strictness

Granola meeting ID: `ce2d6e2d-f992-4f6e-9ff6-b066f340369e`

- Grading strictness is beginner, intermediate, or advanced, currently implemented as prompt modification.
- The same essay should be tested across all strictness levels.
- Tutor can be enabled or disabled for an assignment, including cold-read work.
- Tutor encouragement must line up with rubric performance.
- Tutor behavior needs finer control than one giant prompt.
- Assignment types, not assignment instances, govern the core grading and tutor behavior.

### June 29: Tutor feedback loops and grading rubric refinements

Granola meeting ID: `22d3f1a9-8aec-40f6-a320-8f427f2195a4`

- Give Kevin a playground to tailor tutor prompts and get rapid feedback.
- Avoid making the tutor enumerate every rubric issue. It should act like a holistic teacher and choose the most important next need.
- Tutor language currently misses struggling students; reading level and student context matter.
- Tutor must already know the assignment instead of repeatedly asking what the student is writing about.
- Historical tutor conversations need good/bad labels.
- A tutor-conversation rubric is separate from the essay rubric.
- Human expertise, especially Eric/Kevin/Brian/Bryant calibration, is necessary for defining good tutoring.

### July 6 and July 8: Writing practice delivery and preview testing

Granola meeting IDs:

- `83f51bb2-2c0b-43ee-a432-034af69e20a1`
- `ca5f2a3a-f7a1-407c-8650-63c2681cd12e`

- Writing practice landed behind organization availability and preview seed data.
- Four base prompts were intended to support broad exercise generation.
- Preview model access was necessary to test real tutor responses.
- Kevin's work spans writing lessons, AP History, and assignment-level feedback. This evaluation system must reduce repeated manual uncertainty across those lanes.

## Existing Repository State

Do not start by inventing parallel abstractions. First preserve and extract the behavior already in production.

### Assignment type configuration

`packages/prisma/schema.prisma` currently stores the mutable assignment type AI configuration directly on `AssignmentType`:

- `scoringScaleJson`
- `rubricJson`
- `gradingPromptConfigJson`
- `gradingOutputSchemaJson`
- `gradingCalibrationNotes`
- `gradingAssistantVersion`

Tutor configuration is relational:

- `AssignmentModule.tutorInstructions`
- `AssignmentModule.rubricAlignmentJson`
- `AssignmentModuleInstruction.prompt`
- `AssignmentModuleInstruction.tutorInstructions`

The admin assignment type form already edits rubric, grading instructions, modules, instruction prompts, and rubric alignment. Today those edits affect mutable records. There is no safe draft-vs-published prompt experimentation contract.

### Grading assistant

`services/web-app/app/routes/api.domain.grade-essay-ai/route.ts` currently:

- resolves assignment type grading config;
- builds the model system/user prompts inline;
- applies strictness instructions;
- invokes `getLLMCompletion`;
- repairs malformed JSON;
- runs a separate grammar checker;
- writes grade data to `Submission`;
- records a `SubmissionGradingAssistantRun` snapshot;
- emits searchable `LlmLog` metadata.

This route mixes authorization, record lookup, prompt assembly, model execution, output repair, grading math, and persistence. A benchmark runner must not copy this route's prompt logic. Extract a shared production execution path that both the route and benchmarks call.

### Tutor

`services/web-app/app/routes/api.domain.tutor-response/build-system-prompt.ts` already has a useful prompt builder. `api.domain.tutor-response/route.ts` assembles the current document context, prior messages, module/step instructions, rubric guidance, and `LlmLog` metadata.

The benchmark path must use the same builder and orchestration path as production. It must make version/config selection explicit instead of silently reading the latest mutable records.

### Writing practice

`services/web-app/app/routes/app.writing-lessons.$lessonSlug/route.tsx` currently scores practice locally with `getPrototypeScore`. That heuristic mostly rewards response length, punctuation, concision, and a few phrase checks. It does not understand the lesson's actual rule and cannot serve as the benchmarked grader.

Treat writing-practice grading as its own AI flow on top of the shared evaluation infrastructure. Do not force writing lessons into `AssignmentType` if the domain model does not support that cleanly. The common layer should support multiple versioned target kinds.

### Existing observability

`getLLMCompletion` writes model, provider, prompt, messages, output/error, token counts, latency, and metadata to `LlmLog`. Reuse it. Extend normalized metadata where needed. Do not add a second general AI logging system.

### Existing design proposal

Read `docs/superpowers/specs/2026-06-24-ai-evaluation-benchmarks-design.md`. It contains the earlier proposal for immutable assignment type versions, benchmark suites/cases/runs/results, deterministic context tests, golden cases, candidate-vs-baseline experiments, production trace promotion, and a phased rollout.

That document is directionally correct but predates:

- the Granola evidence listed above;
- the merged writing-practice prototype;
- current prompt/context audit work;
- this explicit three-flow scope;
- Bryant's request for a deliberately minimal admin UI.

Update decisions where current code or product evidence is newer. Do not blindly implement the old schema.

## Required Product Contract

### 1. Production and benchmarks share the same execution code

There must be one canonical execution path per flow. It accepts explicit, serializable inputs and a versioned configuration snapshot, builds the exact provider request, invokes an injected model client, validates the output, and returns a structured result plus trace metadata.

Target shape, adjusted to local conventions:

```ts
type AiFlowKind =
  | 'grading_assistant'
  | 'tutor'
  | 'writing_practice_grader';

type AiInvocation = {
  flowKind: AiFlowKind;
  model: string;
  provider: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  configVersionId: string;
  configHash: string;
  inputHash: string;
  metadata: Record<string, unknown>;
};
```

Do not make route objects, `Request`, Prisma records, or ambient environment reads part of the core prompt compiler API. Resolve those at the boundary, then pass explicit data inward.

Use dependency injection for model execution so unit/integration tests use a deterministic fake. Live model evals must never run in normal CI.

### 2. Version the educational contract

Prompt experimentation must not mutate production behavior before review.

Create an immutable configuration-version concept that can represent:

- assignment type rubric and scoring scale;
- grading prompt and output contract;
- grading calibration/strictness behavior;
- tutor modules, step instructions, and rubric relationships;
- flow-specific model settings;
- writing-practice lesson/grader configuration where applicable;
- compiler/schema version and content hashes.

At minimum, an assignment type needs a current published version and an editable draft version. Publishing creates an immutable version. Existing assignments or sessions must not silently drift to a new educational contract.

Backward compatibility is mandatory. Existing `AssignmentType` columns and active production behavior cannot be cut over in one step. Use backfill plus dual-read/dual-write or another explicit compatibility plan. Put the new behavior behind an internal/admin feature flag. Do not remove legacy fields in this work.

Decide and document whether one generic `AiConfigurationVersion` or an `AssignmentTypeVersion` plus a smaller writing-practice version type best fits the domain. Favor clear ownership over a generic JSON bucket.

### 3. Make configuration replayable

Every benchmark result must preserve enough information to reproduce the invocation:

- flow kind;
- suite and case version;
- candidate and baseline config version IDs;
- exact config snapshot or immutable reference;
- provider/model and generation settings;
- exact assembled system/messages or `LlmLog` reference;
- hashes for prompt/config/input/document/rubric/module context;
- code/compiler version or git SHA;
- raw output, parsed output, evaluator results, latency, tokens, and estimated cost;
- run attempt/repetition number;
- timestamps and actor.

Model aliases can change behavior. Store the requested model identifier and any resolved model/version returned by the provider when available.

### 4. Build Yawp-native benchmark records

Use Yawp's database as the source of truth. External tools can inform the design or be supported through later import/export, but do not make Promptfoo, LangSmith, OpenAI Evals, or Anthropic Console required runtime dependencies.

The backend needs durable equivalents of:

- suite;
- case;
- run/experiment;
- per-case attempt/result;
- evaluator result;
- optional human review.

Support assignment-type-scoped suites and flow-specific cases. Writing-practice suites may be lesson scoped. A suite can contain only one flow kind in the first version; avoid premature mixed-flow orchestration.

Cases need structured inputs and structured expectations, including:

- expected score or band;
- required and forbidden behaviors;
- exact schema/category invariants;
- rubric/module relationship assertions;
- expected concepts or acceptable alternatives;
- provenance and reviewer;
- tags and difficulty;
- `train`, `dev`, or `test` split;
- optional source `LlmLog` for later trace promotion.

Version cases or snapshot them into every run. A historical run must not change when someone edits a case later.

### 5. Evaluate in layers

Use the fastest, most reliable evaluator first.

#### Deterministic code evaluators

Implement these before model-graded quality checks:

- response schema parses;
- exact rubric category keys are present once each;
- score values stay in configured ranges;
- correct assignment type/config version is used;
- input/document hash matches the case;
- current submission is used instead of draft text;
- module alignment includes `primary`, `supporting`, and `preparatory` correctly;
- `not-applicable` categories are omitted from tutor guidance;
- writing-practice result names the correct lesson/rule;
- required trace metadata is present;
- no hidden prompt leakage markers appear;
- required/forbidden phrases or structured fields pass.

Hard deterministic invariant failures make the case fail.

#### Domain-specific rules

Examples:

- beginner/intermediate/advanced grading should show intentionally different calibration without changing the rubric itself;
- tutor must not provide a final grade in a preparatory module;
- tutor must not write the student's thesis or paragraph for them;
- tutor should use the assignment and current draft context;
- tutor should choose the most important next step instead of dumping every rubric issue;
- writing-practice grader should accept valid alternate rewrites;
- a clean sentence should not receive fabricated grammar errors;
- a rhetorical fragment should not automatically be treated as an accidental fragment;
- feedback from tutor and grading assistant should not directly contradict the same rubric evidence.

#### LLM judges

Use only for narrow judgments that code cannot reliably make. Each judge must have a specific rubric and structured output such as:

```json
{
  "pass": true,
  "severity": "none",
  "evidence": "The tutor asks the student to revise the claim without writing it for them."
}
```

Do not use one generic "quality 1-10" score as the release gate. Record judge model/version separately from the model under test. Calibrate judge behavior against human labels before trusting it as a gate.

#### Human review

Support explicit review for ambiguous failures and initial case calibration. Human decisions are data, not comments hidden in a document.

### 6. Compare candidate with baseline

The central experiment is the same cases against:

- baseline: currently published configuration;
- candidate: editable draft configuration and/or selected model settings.

Store both independent results, then compute a comparison. Include absolute pass/fail plus deltas. For tutor tone/usefulness, support blind pairwise review with randomized A/B order to reduce position bias.

At first, quality results are advisory. Hard deterministic context, schema, version, and safety failures block a candidate from being considered passing. Do not automatically publish configuration from a passing run.

### 7. Account for nondeterminism

Support configurable repetitions per case. One repetition is acceptable for quick iteration; high-signal release runs should support at least three.

Report:

- pass rate across attempts;
- score/category variance;
- critical failure rate;
- worst attempt;
- latency, tokens, and estimated cost.

A candidate with one severe failure in repeated runs must not be hidden by a good average.

### 8. Protect student data

Use synthetic or explicitly de-identified fixtures for seeded benchmark cases. Do not seed real names or sensitive student content.

Production trace promotion comes later and must require admin review, redact unnecessary identifiers, preserve source provenance, and respect organization boundaries. Do not copy arbitrary production `LlmLog` payloads into reusable fixtures automatically.

## Initial Benchmark Inventory

Seed a small, high-signal set. Depth matters more than case count for the first pass.

### Grading assistant cases

Include at least:

1. Strong thesis, weak evidence.
2. Weak thesis, strong mechanics.
3. Fluent essay with no defensible claim.
4. Strong reasoning with repeated grammar problems.
5. Generic introduction that should not be overpraised.
6. Incomplete essay that should receive limited credit.
7. Same essay at beginner, intermediate, and advanced strictness.
8. Draft and submission differ; grading must use submission.
9. Clean essay; grammar checker should avoid false positives.
10. Prompt injection text inside the essay; it must remain student content.

### Tutor cases

Include at least:

1. Student asks, "Is my introduction good?" in a thesis-primary module.
2. Student asks for a final score in a preparatory module.
3. Student asks the tutor to write the thesis.
4. Strong thesis with weak organization; tutor chooses the correct next need.
5. Generic opening; tutor redirects constructively without ghostwriting.
6. Grammar is `not-applicable`; tutor does not center grammar.
7. Assignment prompt is present; tutor does not ask what the assignment is.
8. Struggling reader asks for clarification; response becomes simpler and actionable.
9. Student edits the document between turns; tutor uses current document context.
10. Student document contains prompt injection text; hidden instructions remain protected.

### Writing practice grader cases

Include at least:

1. Canonical correction of a comma splice.
2. Different but valid correction of the same comma splice.
3. Incorrect correction that preserves the splice.
4. Concise revision of a wordy sentence.
5. Valid answer that uses different wording than a reference answer.
6. Clean sentence that should pass without an invented problem.
7. Intentional fragment versus accidental fragment.
8. Subject-verb agreement error.
9. Pronoun agreement with an inclusive valid rewrite.
10. Student asks for the answer instead of attempting the exercise.

## Implementation Sequence

Do this in order. Do not begin UI work while the backend is still hypothetical.

### Phase 1: Architecture and extraction

1. Write a concise ADR/spec that updates the June 24 proposal with the three-flow scope and current schema.
2. Extract pure prompt/context compilers and flow executors from the production grading and tutor routes.
3. Add a server-side writing-practice grading contract and deterministic fake implementation for tests.
4. Prove production routes can call the extracted code without behavioral regression.
5. Add deterministic context assembly tests first.

Exit criteria:

- benchmark code can invoke the exact same flow executor as production;
- prompt construction is testable without HTTP or live models;
- current production behavior remains compatible;
- no UI changes.

### Phase 2: Immutable versions and persistence

1. Add the selected immutable config-version model and migration.
2. Backfill published versions from existing assignment type/module records.
3. Add draft/published ownership and content hashing.
4. Add benchmark suite, case, run, result/attempt, evaluator result, and human review records.
5. Store case/config snapshots in runs for historical integrity.
6. Add repository/domain services with authorization and transaction boundaries.

Exit criteria:

- an admin can create a draft candidate without changing published production configuration;
- every run is replayable from durable records;
- migrations have rollback/compatibility reasoning;
- no live model dependency in tests.

### Phase 3: Runner and evaluators

1. Build a resumable benchmark runner service.
2. Add a CLI or internal server entry point that creates and executes a run.
3. Implement deterministic evaluators and structured result aggregation.
4. Add optional narrow LLM-judge support behind explicit configuration.
5. Add baseline-vs-candidate comparison and repeated attempts.
6. Seed the first cases for all three flows.

Do not introduce a queue product unless Yawp already has one. Keep runner orchestration resumable and idempotent so a future worker can call it. For the first version, a CLI/manual internal execution path is acceptable and easier to prove than a long-running browser request.

Exit criteria:

- a local command can run a selected suite against baseline and candidate;
- interrupted runs can be retried without duplicating completed attempts;
- hard failures and advisory quality failures are distinct;
- output includes case-level evidence and aggregate counts;
- live evals are opt-in and cost-bounded.

### Phase 4: Minimal admin UI

Only after Phases 1-3 pass their tests, add a small admin surface within the existing assignment type workflow.

The first UI should provide:

- clear published vs draft identity;
- existing prompt/config editors targeting the draft;
- optional allowlisted candidate model selection for a run;
- one `Run benchmarks` command;
- run status;
- pass/warn/fail counts;
- baseline vs candidate delta;
- a case table;
- a simple case detail with inputs, outputs, evaluator evidence, and prompt/config diff.

Do not build dashboards, charts, drag-and-drop builders, generic evaluator authoring, scheduled-run management, or teacher-facing views in this phase. Reuse existing admin components and visual conventions. The UI is an operational shell around a proven backend.

## Testing Requirements

Follow repository TDD rules.

### Unit tests

- prompt compilers serialize stable requests from explicit config/input;
- hashes are deterministic and change when relevant content changes;
- version snapshots include all rubric, prompt, module, alignment, and model fields;
- grading executor validates exact rubric keys and score ranges;
- tutor executor receives current document and correct module relationships;
- writing-practice executor accepts multiple valid solutions through evaluator rules;
- judge output parser rejects malformed responses;
- aggregate status preserves severe failures even when averages pass.

### Integration tests

- draft changes do not mutate published version;
- publishing creates immutable history and preserves existing assignments/sessions;
- production grading/tutor routes use shared executors;
- run creation snapshots suite cases and candidate/baseline configs;
- retry resumes incomplete attempts idempotently;
- tenant/admin authorization prevents cross-organization access;
- `LlmLog` and benchmark result references line up.

### E2E tests

- admin edits a draft grading prompt, runs a fake benchmark, and sees comparison results;
- admin can inspect a failed case and its evidence;
- published production config remains unchanged until explicit publish flow;
- writing-practice benchmark results render through the same minimal result view.

### Live eval tests

- excluded from normal CI;
- require explicit environment opt-in;
- enforce case/repetition/token/cost limits;
- persist all outputs and metadata;
- never write benchmark output into student submissions or production tutor conversations.

## Acceptance Criteria

This work is complete when all of the following are true:

1. The three AI flows have explicit shared execution contracts used by both production and benchmark code.
2. Assignment type AI configuration can exist as an editable draft and immutable published baseline.
3. A benchmark suite can run baseline and candidate against the same snapshotted cases.
4. Results preserve exact model/config/input/prompt identity and can be replayed.
5. Deterministic evaluators catch wrong document, wrong rubric keys, schema failures, and module-alignment failures.
6. Tutor quality checks cover ghostwriting, assignment awareness, current-document use, module stage, and rubric consistency.
7. Grading checks cover strictness calibration, rubric grounding, score validity, submission snapshot, and grammar false positives.
8. Writing-practice checks cover rule correctness and multiple valid revisions.
9. Repeated live runs expose variance and severe failure rate.
10. Tests do not call a live model by default.
11. Existing production behavior remains backward compatible behind an explicit migration/feature-flag plan.
12. The final admin UI is small, usable, and secondary to the backend evidence.
13. No prompt/model candidate can affect production merely because it was edited or benchmarked.
14. No external eval vendor is required for Yawp to store, run, or understand its benchmarks.

## Non-Goals For This First Build

- No automatic prompt optimization.
- No fine-tuning pipeline.
- No automatic production publishing.
- No teacher-facing benchmark UI.
- No generalized no-code evaluator builder.
- No scheduled fleet of model regression jobs.
- No automatic ingestion of raw student production traces.
- No redesign of the entire assignment type admin.
- No removal of legacy assignment type fields.
- No broad analytics dashboard.

## External Patterns To Borrow, Not Adopt Wholesale

- Anthropic recommends explicit, measurable, task-specific success criteria; multidimensional evaluation; code grading before LLM grading; prompt version comparison; and test sets that mirror real distribution and edge cases:
  - https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
  - https://platform.claude.com/docs/en/test-and-evaluate/eval-tool
- OpenAI's eval/graders model separates dataset schema, runs, and graders and supports deterministic string/code checks plus model-based and composite graders:
  - https://platform.openai.com/docs/api-reference/evals
  - https://platform.openai.com/docs/api-reference/graders
- Promptfoo's assertion model is a useful reference for per-case required checks and machine-readable outputs, but it should not own Yawp's product data:
  - https://www.promptfoo.dev/docs/configuration/expected-outputs/
- LangSmith's offline dataset/experiment loop, production-trace feedback loop, and randomized pairwise comparison are useful design references:
  - https://docs.langchain.com/langsmith/evaluation
  - https://docs.langchain.com/langsmith/evaluate-pairwise

## First Actions For The Implementing Agent

1. Read this prompt, `AGENTS.md`, the June 24 benchmark design, current Prisma schema, grading route, tutor route/prompt builder, assignment type admin routes, and writing-practice route.
2. Set up the worktree and run the relevant baseline tests before editing.
3. Write the updated ADR and proposed migration/compatibility sequence.
4. Implement Phase 1 only after the data/control boundaries are explicit.
5. Keep a running proof log of commands, tests, migrations, and behavioral decisions.
6. Commit each coherent change locally. Do not push, deploy, or mutate external systems without Bryant's explicit gate.

The standard is not "we made a prompt editor." The standard is "Yawp can change prompts or models and know, with durable case-level evidence, whether tutoring and grading behavior stayed aligned with its educational judgment."
