/**
 * The small model behind the picture editor and the second look (Nov 22,
 * night; docs/plans/2026-11-22-picture-editor-build-plan.md). Claude Haiku
 * 5.5 at low effort, its answer held to a JSON schema, each call on its own
 * short limit, logged with its answer but never its input (the second look
 * carries pictures, the editor the teacher's slides), and never handed to
 * another provider. `LESSON_PLANNER_PICTURE_MODEL=off` turns both off.
 *
 * Not counted against the teacher's hourly planner requests: both calls are
 * part of a turn that was already admitted, a third of a cent between them,
 * and a teacher should never read "you have reached your limit" because
 * Yawp! looked at pictures.
 */
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { SECOND_LOOK_SCHEMA, type LookAt } from './picture-check.server';
import {
  PICTURE_EDITOR_SCHEMA,
  type AskEditor,
} from './picture-subjects.server';

export const DEFAULT_PICTURE_MODEL = 'claude-haiku-5-5';
const EDITOR_MS = 5_000;
// Per batch of four pictures, the batches side by side.
const LOOK_MS = 10_000;

type Attribution = Parameters<typeof getLLMCompletion>[0]['attribution'];
type Complete = typeof getLLMCompletion;

/** The model's status code on a refused request, when the error carries one. */
const statusOf = (error: unknown) =>
  error &&
  typeof error === 'object' &&
  'status' in error &&
  typeof error.status === 'number'
    ? error.status
    : null;

export function pictureModelCalls(
  attribution: () => Attribution,
  {
    model = process.env.LESSON_PLANNER_PICTURE_MODEL || DEFAULT_PICTURE_MODEL,
    complete = getLLMCompletion,
  }: { model?: string; complete?: Complete } = {}
): { name?: AskEditor; look?: LookAt } {
  if (model === 'off') return {};
  const call = async (
    feature: string,
    ms: number,
    schema: object,
    system: string,
    content: string | Array<Record<string, unknown>>
  ) => {
    const signal = AbortSignal.timeout(ms);
    const request = (outputConfig?: Record<string, unknown>) =>
      complete({
        model,
        system,
        messages: [{ role: AgentType.User, content }],
        maxTokens: 4_000,
        attribution: attribution(),
        allowFallbackProvider: false,
        signal,
        logPayload: 'response-only',
        metadata: { feature },
        ...(outputConfig ? { outputConfig } : {}),
      });
    try {
      return await request({
        effort: 'low',
        format: { type: 'json_schema', schema },
      });
    } catch (error) {
      // A model that will not take these settings is asked once more without them.
      if (statusOf(error) === 400 && !signal.aborted) return request();
      throw error;
    }
  };
  return {
    name: (system, prompt) =>
      call(
        'lesson-planner-picture-editor',
        EDITOR_MS,
        PICTURE_EDITOR_SCHEMA,
        system,
        prompt
      ),
    look: (system, content) =>
      call(
        'lesson-planner-picture-look',
        LOOK_MS,
        SECOND_LOOK_SCHEMA,
        system,
        content
      ),
  };
}
