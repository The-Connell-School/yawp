# YAWP Free Tier Feasibility (investigation)

This doc summarizes current implementation details and constraints relevant to a proposed free tier (1 teacher, 1 class, 35 students, HS only) with AI-usage caps, student class-code join, and no email/Google sign-in. All code references are inline.

## 1) Cost per AI feature (models, sizes, calls, retries)

Pricing assumptions (public list as of 2024; adjust if you pin later):
- Anthropic Claude Sonnet (3.5/3.7 class): input $3.00 / 1M tokens, output $15.00 / 1M tokens
- OpenAI GPT-4o-mini (fallback): input $0.15 / 1M tokens, output $0.60 / 1M tokens

Runtime selection and fallback:

```114:120:services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts
function getOpenAiFallbackModel(params: Params) {
  return (
    params.fallbackModel?.trim() ||
    process.env.OPENAI_FALLBACK_MODEL?.trim() ||
    'gpt-4o-mini'
  );
}
```

```510:515:services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts
if (params.model.includes('claude')) {
  const fallbackAvailable =
    params.allowFallbackProvider !== false && isFallbackEnabled();
```

Token logging exists (see “Real numbers” below):

```81:88:services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts
const metadataOnly = data.logPayload === 'metadata-only';
try {
  await prisma.llmLog.create({
    data: {
      model: data.model,
      provider: data.provider,
      systemPrompt: metadataOnly ? undefined : data.systemPrompt,
```

```1647:1662:packages/prisma/schema.prisma
model LlmLog {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  model        String
  provider     String // 'anthropic' or 'openai'
  inputTokens  Int?
  outputTokens Int?
  totalTokens  Int?
  durationMs   Int?
  systemPrompt String?
  messages     Json // Input messages
  response     String? // Output text
  error        String? // Error message if failed
  metadata     Json? // Any additional context (e.g., caller info)
```

Feature breakdown and estimates (per use):

- Daily Pages: grading flow (default model from env; falls back to Claude Sonnet if set, else hard-coded default)

```830:832:services/web-app/app/routes/api.domain.grade-essay-ai/route.ts
const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
const forceFallback = data.llmRetry === 'fallback';
```

  - Calls per grade:
    - Rubric evaluation: one call (maxTokens derived from rubric size; default max 900 from template, with upper repair budget)

```118:121:services/web-app/app/domain/grading/grading-assistant-invocation.ts
export function compileGradingAssistantInvocation({
  gradingConfig,
  studentFirstName,
```
```234:237:services/web-app/app/domain/grading/grading-assistant-invocation.ts
  return {
    system,
    userMessage,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 900,
  };
```
```99:107:services/web-app/app/routes/api.domain.grade-essay-ai/route.ts
export function getRubricEvaluationMaxTokens(categoryCount: number) {
  const baseCategoryCount = 5;
  const baseMaxTokens = 900;
  const tokensPerAdditionalCategory = 300;
  return Math.min(
    2400,
    baseMaxTokens +
      Math.max(0, categoryCount - baseCategoryCount) *
        tokensPerAdditionalCategory
  );
}
```

    - Overall comment sentence: one call (maxTokens 300)

```1130:1141:services/web-app/app/routes/api.domain.grade-essay-ai/route.ts
const overallCommentResponseText = await getGradingLlmCompletion({
  model,
  system: `You write the overall feedback sentence for a grading assistant. Return ONLY valid JSON with the schema:
{
  "overallComment": string
}
…`,
  messages: [ … ],
  maxTokens: 300,
  temperature: 0.2,
  metadata: { feature: 'grading', kind: 'overall-comment', … },
});
```

    - JSON repair when malformed: one call (budget up to 2400 via rubricEvaluationMaxTokens)

```1188:1205:services/web-app/app/routes/api.domain.grade-essay-ai/route.ts
const repairedResponseText = await getGradingLlmCompletion({
  model,
  system: `You repair grading assistant JSON. Return ONLY valid JSON with the schema:
${buildGradingResponseSchemaText(…)}
…`,
  messages: [ … ],
  maxTokens: rubricEvaluationMaxTokens,
  temperature: 0.1,
  metadata: { feature: 'grading', kind: 'rubric-schema-repair', … },
});
```

    - Grammar issues pass: one call + optional retry (each maxTokens 1600)

```1345:1352:services/web-app/app/routes/api.domain.grade-essay-ai/route.ts
let grammarResponseText = await getGradingLlmCompletion({
  model,
  system: grammarSystem,
  messages: [{ role: 'user', content: grammarUserPrompt }],
  maxTokens: 1600,
  temperature: 0.2,
  metadata: { feature: 'grading', kind: 'grammar-issues', … },
});
```
```1373:1380:services/web-app/app/routes/api.domain.grade-essay-ai/route.ts
grammarResponseText = await getGradingLlmCompletion({
  model,
  system: grammarSystem,
  messages: [ { role: 'user', content: buildGrammarCheckerRetryUserPrompt(…) } ],
  maxTokens: 1600,
  temperature: 0.2,
  metadata: { feature: 'grading', kind: 'grammar-issues', retry: 'schema-repair', … },
});
```

  - Estimate (Daily Pages short paragraph; rubric ~5 cats):
    - Rubric evaluation: ~1.5k input + ~500 output
    - Overall sentence: ~1.2k input + ~100 output
    - Grammar: ~0.8k input + ~400 output (+ optional retry once)
    - Cost ≈ $0.04/grade (no repair; add ~+$0.01 if grammar retry hits)

- Tutor message (student turn):

```258:263:services/web-app/app/routes/api.domain.tutor-response/route.ts
completion = await getLLMCompletion({
  model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
  messages,
  system,
  maxTokens: 500,
  forceFallback,
  signalFallbackRetry: !forceFallback,
  metadata: { feature: 'tutor', kind: 'assignment-module-tutor', … },
});
```
  - Calls per student message: 1
  - Typical prompt contains prior turns + doc context; assume ~1.5k input + ~300 output
  - Cost ≈ $0.009/turn; 5 turns ≈ $0.045

- Class Summary (assignment-level insight for teachers):

```16:18:services/web-app/app/domain/assignment-insights/class-insight-synthesis.server.ts
const INSIGHT_MAX_TOKENS = 1200;
const INSIGHT_TEMPERATURE = 0.4;
const INSIGHT_REQUEST_DEADLINE_MS = 30_000;
```
```98:103:services/web-app/app/domain/assignment-insights/class-insight-synthesis.server.ts
const raw = await getLLMCompletion({
  model,
  system,
  messages: [{ role: 'user', content: user }],
  maxTokens: INSIGHT_MAX_TOKENS,
  temperature: INSIGHT_TEMPERATURE,
  allowFallbackProvider: false,
  logPayload: 'metadata-only',
  signal: AbortSignal.timeout(INSIGHT_REQUEST_DEADLINE_MS),
  metadata: { feature: 'assignment-level-feedback', … },
});
```
  - One call per generation; assume ~1.2k input + ~300 output → ≈ $0.008/use

- Reporter (teacher chat with tools):

```206:213:services/web-app/app/routes/api.domain.reporter/route.ts
reply = await getLLMCompletion({
  model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
  system,
  messages,
  maxTokens: 1500,
  maxToolRounds: 6,
  tools: REPORTER_TOOLS,
  handleToolCall: (name, input) => handleReporterToolCall(name, input, ctx),
  allowFallbackProvider: false,
  signal: AbortSignal.timeout(REPORTER_REQUEST_DEADLINE_MS),
  logPayload: 'metadata-only',
  metadata: { feature: 'reporter' },
});
```
  - Anthropic tool-use loops can execute multiple API rounds; assume 2 rounds average
  - Per round assume ~1.0k input + ~500 output → ≈ $0.0105; 2 rounds ≈ $0.021/chat

- Lesson Planner
  - No live LLM “planner” endpoint in code. Writing Lessons are static-archive backed (no per-use LLM): 

```80:90:services/web-app/app/utils/writing-lessons/static-lessons.server.ts
export function getQuickWritingLessons(): QuickWritingLesson[] {
  if (!cachedLessons) {
    cachedLessons = parseArchivedLessons(promptContent);
  }
  return cachedLessons;
}

export function getQuickWritingLessonBySlug(
  slug: string | undefined
): QuickWritingLesson | null {
```

Daily Pages Prompt Generators (if considered “planning”) are LLM-backed:

```96:99:services/web-app/app/routes/api.domain.daily-pages-prompt-generator/route.ts
completion = await getLLMCompletion({
  model,
  system: SYSTEM_PROMPT,
  messages: messages.slice(-MAX_GENERATOR_MESSAGES),
  temperature: 0.7,
  maxTokens: MAX_GENERATOR_OUTPUT_TOKENS,
  metadata: { route: '/api/domain/daily-pages-prompt-generator', … },
});
```
```80:92:services/web-app/app/routes/app.assignment-types.$id/prompts-library/prompt-generator.ts
export const MAX_GENERATOR_OUTPUT_TOKENS = 1500;
…
export function resolveGeneratorModel(
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env.AI_MODEL?.trim();
  return configured && configured.includes('claude')
    ? configured
    : 'claude-sonnet-4-6';
}
```
  - One call per chat turn; assume ~1.0k input + ~700 output → ≈ $0.013/use

Estimated $ per class of 35 per month (example usage assumptions):
- Daily Pages grading: 8 graded entries/student/month → 35 × 8 × $0.04 ≈ $11.20
- Tutor turns: 3 turns/student on 4 assignments → 35 × 12 × $0.009 ≈ $3.78
- Class Summary: 4 times/month → 4 × $0.008 ≈ $0.03
- Reporter: 20 chats/month → 20 × $0.021 ≈ $0.42
- Prompt generator: 20 turns/month → 20 × $0.013 ≈ $0.26

Order-of-magnitude total ≈ $15/month/class (Daily Pages dominates). Adjust down via caps.

Real numbers (from logs): query `LlmLog` by feature/model/time, sum `inputTokens`/`outputTokens` × pricing.

## 2) Plan enforcement: seats, flags, quotas

Current org-level seats and feature flags:

```1046:1049:packages/prisma/schema.prisma
  numOfStudentSeats             Int                          @default(10)
  numOfTeacherSeats             Int                          @default(10)
  reporterEnabled               Boolean                      @default(false)
  classInsightsEnabled          Boolean                      @default(false)
```

Feature gating (Reporter, Insights) uses org flags:

```31:36:services/web-app/app/utils/reporter/reporter-access.server.ts
const organization = await prisma.organization.findUnique({
  where: { id: membership.organization.id },
  select: { reporterEnabled: true },
});
const enabled = Boolean(organization?.reporterEnabled);
```

Seat counts are enforced only in internal tooling paths (not global admission):

```37:40:services/web-app/app/utils/internal-scenario.server.ts
const [org] = await tx.$queryRaw<Array<{ id: string; numOfTeacherSeats: number; numOfStudentSeats: number }>>`
  SELECT id, "numOfTeacherSeats", "numOfStudentSeats" FROM "Organization" WHERE id=${scope.organizationId} FOR UPDATE`;
…
if (count + requested > (role === 'TEACHER' ? org.numOfTeacherSeats : org.numOfStudentSeats)) throw new Error('Organization seat limit exceeded');
```

AI usage is rate-limited per org/member with sliding windows (not monthly caps):

```20:29:services/web-app/app/utils/ai-admission.server.ts
export type AiAdmissionPolicy = {
  membershipLimit: number;
  membershipWindowMs: number;
  organizationLimit: number;
  organizationWindowMs: number;
};

export async function reserveAiRequest({ … }: { … }): Promise<void> {
```

Conclusion: flags can gate features; seats exist; no plan/entitlements yet for (1 teacher / 1 class / 35 students) or monthly AI budgets. Minimal schema to support a free tier and “Founding Faculty”:
- Add `Organization.plan` enum: free | founding_faculty | paid
- Add `Organization.planExpiresAt: DateTime?` (for time-limited founding caps)
- Add `Organization.aiMonthlyTokenLimitJson: Json?` (per-feature token/request caps; start simple with totals)
- Add `AiUsageRollup` table with daily counters per org/feature to enforce monthly budgets (batch job or on write)

## 3) Class-code join path today

Yes — student joins class by code (scoped to their org). Loader/action handle validation, disambiguation, and enrollment.

```41:46:services/web-app/app/routes/enter-code/route.tsx
function classCodeWhere(organizationId: string, code: string) {
  return {
    isArchived: false,
    code: { equals: code, mode: 'insensitive' as const },
    school: { organizationId },
  };
}
```
```129:133:services/web-app/app/routes/enter-code/route.tsx
if (classes.length === 0) {
  return validationError({ fieldErrors: { code: 'Invalid code.' } });
}
```
```228:232:services/web-app/app/routes/enter-code/route.tsx
<div className="flex flex-col gap-3 text-center mb-8">
  <h1 className="text-2xl font-bold">Enter Your Class Code</h1>
  <p className="text-sm text-muted-foreground">
    Enter your class code to get started
  </p>
</div>
```

Note: current flow requires a logged-in student membership.

## 4) Student account without email?

Not supported: `User.email` is required and unique. Login UI requires email/password.

```1406:1413:packages/prisma/schema.prisma
model User {
  id           String          @id @default(cuid())
  createdAt    DateTime        @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime        @default(now()) @db.Timestamptz(6)
  email        String          @unique
  name         String?
  password     Password?
  sessions     Session[]
```
```10:17:services/web-app/app/components/login-form.tsx
export const LoginSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().nullish(),
});
```
Breaks without email: auth (login schema, verification), uniqueness (user PK by email), invites/notifications (email target), and some fallbacks that surface `user.email` in UI.

## 5) Proposed limits and login design (free tier)

- AI usage caps (per class, per 30 days; clip at budget, not time-window):
  - Grading: 300 runs
  - Tutor: 600 student turns
  - Reporter: 100 chats
  - Class Summary: 20 generations
  - Prompt generators: 100 turns
  - Founding Faculty (10 teachers): 3× caps for 12 months on their orgs

- Class-code + first-name student login (shared Chromebooks; no cookies):
  - Entry: student enters class code + first name + teacher’s short daily PIN
  - Server issues a short-lived bearer “seat token” (JWT) bound to class, first name, and a rotating class-day secret; store only in-memory (no cookie/localStorage persistence)
  - Name collisions: if multiple students share first name, require selecting last initial or a teacher-assigned nickname during first entry; bind that discriminator into the seat token
  - Re-entry: tokens expire after N minutes of inactivity or at day rollover; student re-enters code + name + PIN
  - Teacher reset: “Reset class tokens” invalidates the class-day secret; all seat tokens for that class become invalid until the new PIN is shared
  - Network constraints: first-party Authorization header bearer avoids cookies; no third-party storage; works on Google-managed networks and shared devices

Implementation sketch: keep existing account model for teachers; students on free tier use ephemeral seat tokens (no `User` row), with later uplift to full accounts if the org upgrades.

## How to get actual AI cost from logs

- Query `LlmLog` grouped by `provider`, `model`, `metadata.feature`, with time window filters, summing `inputTokens` and `outputTokens`, then apply pricing per 1M tokens. Example group-bys: per organization (attach `organizationId` in `metadata` on the callers), per feature (grading, tutor, reporter, insights), and per class assignment.

