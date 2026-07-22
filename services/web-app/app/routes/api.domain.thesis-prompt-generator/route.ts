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
  resolveGeneratorModel,
} from '../app.assignment-types.$id/thesis-prompts-library/prompt-generator';
import type { ThesisPrompt } from '../app.assignment-types.$id/thesis-prompts-library/data';
import thesisPromptsRaw from '../app.assignment-types.$id/thesis-prompts-library/prompts.json';

const ALL_THESIS_PROMPTS = thesisPromptsRaw as ThesisPrompt[];
const SYSTEM_PROMPT = buildGeneratorSystemPrompt(ALL_THESIS_PROMPTS);

const GENERIC_ERROR =
  'The prompt generator is unavailable right now. Please try again.';

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
      messages: messages.slice(-MAX_GENERATOR_MESSAGES),
      temperature: 0.7,
      maxTokens: 1500,
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

  const parsed = safeParseGeneratorResponse(completion);
  if (parsed) {
    return dataResponse({
      success: true,
      reply: parsed.reply,
      prompt: parsed.prompt,
    });
  }

  // The model returned something we can't structure. Surface its text as the
  // reply so the teacher can keep the conversation going.
  const fallbackReply =
    typeof completion === 'string' && completion.trim().length > 0
      ? completion.trim()
      : GENERIC_ERROR;
  return dataResponse({ success: true, reply: fallbackReply, prompt: null });
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
