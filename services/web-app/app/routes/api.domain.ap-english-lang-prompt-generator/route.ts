// Drafts AP English Language argument prompts with the LLM.
//
// The few-shot examples come from the teacher's own curated library rows, so
// drafts match the course they are actually teaching.

import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { listApEnglishLangLibraryEntries } from '~/domain/ap-english-lang/library.server';
import {
  type GeneratorMessage,
  GeneratorResponseSchema,
  MAX_GENERATOR_MESSAGE_LENGTH,
  MAX_GENERATOR_MESSAGES,
  MAX_GENERATOR_OUTPUT_TOKENS,
} from '~/domain/ap-english-lang/generated-prompt';
import {
  buildGeneratorSystemPrompt,
  resolveGeneratorModel,
} from '~/domain/ap-english-lang/prompt-generator';
import {
  isAssignmentTypeAvailableForAnyScope,
  type AssignmentTypeAccessScope,
} from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const GENERIC_ERROR =
  'The prompt generator is unavailable right now. Please try again.';

const RETRY_MESSAGE =
  "Sorry — that one got tangled on my end and didn't come through cleanly. Mind sending it again? If it keeps happening, narrowing the ask (a single unit, theme, or grade level) usually does the trick.";

function parseMessages(
  raw: FormDataEntryValue | null
): GeneratorMessage[] | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const messages: GeneratorMessage[] = [];
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      ((entry as { role?: unknown }).role !== 'user' &&
        (entry as { role?: unknown }).role !== 'assistant') ||
      typeof (entry as { content?: unknown }).content !== 'string'
    ) {
      return null;
    }
    const content = (entry as { content: string }).content.trim();
    if (content.length === 0) continue;
    messages.push({
      role: (entry as { role: 'user' | 'assistant' }).role,
      content: content.slice(0, MAX_GENERATOR_MESSAGE_LENGTH),
    });
  }
  return messages;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can generate prompts.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const assignmentTypeId = String(formData.get('assignmentTypeId') ?? '').trim();
  const messages = parseMessages(formData.get('messages'));

  if (!assignmentTypeId) {
    return dataResponse(
      { success: false, message: 'Assignment type not found.' },
      { status: 400 }
    );
  }
  if (!messages || messages.length === 0) {
    return dataResponse(
      { success: false, message: 'Describe the prompt you want to create.' },
      { status: 400 }
    );
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return dataResponse(
      {
        success: false,
        message: 'The last message must come from the teacher.',
      },
      { status: 400 }
    );
  }

  const teacherClasses = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: { id: true, school: { select: { id: true, organizationId: true } } },
  });
  const scopes: AssignmentTypeAccessScope[] =
    teacherClasses.length === 0
      ? [
          {
            organizationId: profile.organization.id,
            teacherProfileId: profile.id,
          },
        ]
      : teacherClasses.map((klass) => ({
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: profile.id,
        }));

  const available = await isAssignmentTypeAvailableForAnyScope({
    assignmentTypeId,
    scopes,
  });
  if (!available) {
    return dataResponse(
      { success: false, message: 'Assignment type not found.' },
      { status: 404 }
    );
  }

  const libraryEntries = await listApEnglishLangLibraryEntries(assignmentTypeId);
  const systemPrompt = buildGeneratorSystemPrompt(libraryEntries);
  const model = resolveGeneratorModel();

  // Mirrors the grading route: with no API key configured, E2E runs get a
  // deterministic draft so the generator flow is testable end to end.
  if (shouldUseE2EGeneratorFixture()) {
    return dataResponse(E2E_GENERATOR_FIXTURE);
  }

  let completion: string;
  try {
    completion = await getLLMCompletion({
      model,
      system: systemPrompt,
      messages: messages.slice(-MAX_GENERATOR_MESSAGES),
      temperature: 0.7,
      maxTokens: MAX_GENERATOR_OUTPUT_TOKENS,
      metadata: {
        route: '/api/domain/ap-english-lang-prompt-generator',
        membershipId: profile.id,
        turnCount: messages.length,
      },
    });
  } catch {
    return dataResponse(
      { success: false, message: GENERIC_ERROR },
      { status: 500 }
    );
  }

  const parsed = safeParseGeneratorResponse(completion);
  if (parsed) {
    return dataResponse({
      success: true,
      reply: parsed.reply,
      options: parsed.options,
    });
  }

  // We couldn't structure the response. If it looks like a (likely truncated)
  // JSON attempt, never surface the raw JSON to the teacher — ask them to try
  // again. Only genuinely plain prose is passed through as a chat reply.
  const trimmed = completion.trim();
  if (trimmed.length === 0 || looksLikeJsonAttempt(trimmed)) {
    return dataResponse({ success: true, reply: RETRY_MESSAGE, options: [] });
  }
  return dataResponse({ success: true, reply: trimmed, options: [] });
}

function shouldUseE2EGeneratorFixture() {
  return (
    process.env.E2E === 'true' &&
    process.env.E2E_PROMPT_GENERATOR_FIXTURE === 'true' &&
    !process.env.ANTHROPIC_API_KEY
  );
}

/** Deterministic stand-in for a model turn, used only by the E2E fixture. */
const E2E_GENERATOR_FIXTURE = {
  success: true,
  reply: 'Here are three angles on obligation.',
  options: [
    {
      title: 'What We Owe Strangers',
      prompt:
        'Communities are held together by obligations nobody signed up for. Write an essay that argues your position on what we owe people we will never meet.',
      frqType: 'argument' as const,
      focusSkill: 'line-of-reasoning',
      difficulty: 'developing' as const,
    },
    {
      title: 'The Limits of Loyalty',
      prompt:
        'Loyalty is praised until it collides with honesty. Write an essay that argues your position on what a person owes the people closest to them.',
      frqType: 'argument' as const,
      focusSkill: 'counterargument',
      difficulty: 'exam-ready' as const,
    },
    {
      title: 'Who Counts as a Neighbor',
      prompt:
        'Write an essay that argues your position on how far a community\'s responsibility for its members extends.',
      frqType: 'argument' as const,
      focusSkill: 'defining-terms',
      difficulty: 'developing' as const,
    },
  ],
};

function looksLikeJsonAttempt(text: string): boolean {
  return (
    /^[[{]/.test(text) ||
    /"(reply|options|prompt|title|frqType|focusSkill|difficulty)"\s*:/.test(text)
  );
}

function safeParseGeneratorResponse(completion: string) {
  let jsonValue: unknown;
  try {
    jsonValue = parseFirstJsonValue(completion);
  } catch {
    return null;
  }
  const parsed = GeneratorResponseSchema.safeParse(jsonValue);
  return parsed.success ? parsed.data : null;
}
