import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import {
  listConversations,
  loadConversation,
  recordExchange,
} from '../app.assignment-types.$id/thesis-prompts-library/generator-history.server';
import {
  buildGeneratorSystemPrompt,
  type GeneratedPrompt,
  type GeneratorMessage,
  GeneratorResponseSchema,
  MAX_GENERATOR_MESSAGE_LENGTH,
  MAX_GENERATOR_OUTPUT_TOKENS,
  resolveGeneratorModel,
  selectRecentMessages,
} from '../app.assignment-types.$id/thesis-prompts-library/prompt-generator';
import type { ThesisPrompt } from '../app.assignment-types.$id/thesis-prompts-library/data';
import thesisPromptsRaw from '../app.assignment-types.$id/thesis-prompts-library/prompts.json';

const ALL_THESIS_PROMPTS = thesisPromptsRaw as ThesisPrompt[];
const SYSTEM_PROMPT = buildGeneratorSystemPrompt(ALL_THESIS_PROMPTS);

const GENERIC_ERROR =
  'The prompt generator is unavailable right now. Please try again.';

const RETRY_MESSAGE =
  "Sorry — that one got tangled on my end and didn't come through cleanly. Mind sending it again? If it keeps happening, narrowing the ask (a single focus, character, or angle) usually does the trick.";

function parseMessages(raw: FormDataEntryValue | null): GeneratorMessage[] | null {
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

function parseConversationId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads the teacher's saved conversations: the list by default, or one full
 * conversation with `?conversationId=`. Same teacher gating as the action, and
 * the history module scopes every read to the requesting membership.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can generate prompts.' },
      { status: 403 }
    );
  }

  const conversationId = new URL(request.url).searchParams.get('conversationId');

  if (conversationId) {
    const conversation = await loadConversation(conversationId, profile.id);
    if (!conversation) {
      return dataResponse(
        { success: false, message: 'That conversation is no longer available.' },
        { status: 404 }
      );
    }
    return dataResponse({ success: true, conversation });
  }

  return dataResponse({
    success: true,
    conversations: await listConversations(profile.id),
  });
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
  const conversationId = parseConversationId(formData.get('conversationId'));

  if (!messages || messages.length === 0) {
    return dataResponse(
      { success: false, message: 'Describe the prompt you want to create.' },
      { status: 400 }
    );
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return dataResponse(
      { success: false, message: 'The last message must come from the teacher.' },
      { status: 400 }
    );
  }

  const model = resolveGeneratorModel();

  let completion: string;
  try {
    completion = await getLLMCompletion({
      model,
      system: SYSTEM_PROMPT,
      messages: selectRecentMessages(messages),
      temperature: 0.7,
      maxTokens: MAX_GENERATOR_OUTPUT_TOKENS,
      metadata: {
        route: '/api/domain/thesis-prompt-generator',
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

  const teacherMessage = messages[messages.length - 1]?.content ?? '';

  /**
   * Save the exchange and hand the thread id back so the next turn appends to
   * the same conversation. A failed or disabled save just yields the previous
   * id — the generator's answer is never held up by history.
   */
  async function respond(reply: string, options: GeneratedPrompt[]) {
    const savedId = await recordExchange({
      conversationId,
      membershipId: profile.id,
      teacherMessage,
      reply,
      options,
    });
    return dataResponse({
      success: true,
      reply,
      options,
      conversationId: savedId ?? conversationId,
    });
  }

  const parsed = safeParseGeneratorResponse(completion);
  if (parsed) {
    return respond(parsed.reply, parsed.options);
  }

  // We couldn't structure the response. If it looks like a (likely truncated)
  // JSON attempt, never surface the raw JSON to the teacher — ask them to try
  // again. Only genuinely plain prose is passed through as a chat reply.
  const trimmed = completion.trim();
  if (trimmed.length === 0 || looksLikeJsonAttempt(trimmed)) {
    // A retry nudge isn't something a teacher would want to reopen later, so
    // this one is deliberately not saved.
    return dataResponse({
      success: true,
      reply: RETRY_MESSAGE,
      options: [],
      conversationId,
    });
  }
  return respond(trimmed, []);
}

function looksLikeJsonAttempt(text: string): boolean {
  return (
    /^[[{]/.test(text) ||
    /"(reply|options|prompt|title|body)"\s*:/.test(text)
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
