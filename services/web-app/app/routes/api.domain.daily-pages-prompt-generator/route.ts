import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import {
  buildGeneratorSystemPrompt,
  type GeneratorMessage,
  GeneratorResponseSchema,
  MAX_GENERATOR_MESSAGE_LENGTH,
  MAX_GENERATOR_MESSAGES,
  MAX_GENERATOR_OUTPUT_TOKENS,
  resolveGeneratorModel,
} from '../app.assignment-types.$id/prompts-library/prompt-generator';
import type { LibraryPrompt } from '../app.assignment-types.$id/prompts-library/data';
import promptsRaw from '../app.assignment-types.$id/prompts-library/prompts.json';

const ALL_PROMPTS = promptsRaw as LibraryPrompt[];
const SYSTEM_PROMPT = buildGeneratorSystemPrompt(ALL_PROMPTS);

const GENERIC_ERROR =
  'The prompt generator is unavailable right now. Please try again.';

const RETRY_MESSAGE =
  "Sorry — that one got tangled on my end and didn't come through cleanly. Mind sending it again? If it keeps happening, narrowing the ask (a single theme, text, or grade level) usually does the trick.";

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
  const messages = parseMessages(formData.get('messages'));

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

  const model = resolveGeneratorModel();

  let completion: string;
  try {
    completion = await getLLMCompletion({
      model,
      system: SYSTEM_PROMPT,
      messages: messages.slice(-MAX_GENERATOR_MESSAGES),
      temperature: 0.7,
      maxTokens: MAX_GENERATOR_OUTPUT_TOKENS,
      // See the identical comment in
      // api.domain.thesis-prompt-generator/route.ts: teacher-typed free
      // text that routinely names students, with no single subject student
      // to key a redaction mapping on. Never persisted in cleartext, never
      // crossed to a second provider.
      allowFallbackProvider: false,
      logPayload: 'metadata-only',
      metadata: {
        route: '/api/domain/daily-pages-prompt-generator',
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

function looksLikeJsonAttempt(text: string): boolean {
  return (
    /^[[{]/.test(text) ||
    /"(reply|options|prompt|type|seriousness|cognitiveMoves)"\s*:/.test(text)
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
