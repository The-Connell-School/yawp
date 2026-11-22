/**
 * The small model behind the picture editor and the second look (Nov 22,
 * night; docs/plans/2026-11-22-picture-editor-build-plan.md). Claude Haiku
 * 5.5 at low effort, each call on its own short limit, logged without its
 * payload (the second look carries pictures), and never handed to another
 * provider. `LESSON_PLANNER_PICTURE_MODEL=off` turns both off.
 *
 * Not counted against the teacher's hourly planner requests: both calls are
 * part of a turn that was already admitted, a third of a cent between them,
 * and a teacher should never read "you have reached your limit" because
 * Yawp! looked at pictures.
 */
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import type { LookAt } from './picture-check.server';
import type { AskEditor } from './picture-subjects.server';

export const DEFAULT_PICTURE_MODEL = 'claude-haiku-5-5';
const EDITOR_MS = 5_000;
const LOOK_MS = 8_000;

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
        logPayload: 'metadata-only',
        metadata: { feature },
        ...(outputConfig ? { outputConfig } : {}),
      });
    try {
      return await request({ effort: 'low' });
    } catch (error) {
      // A model that will not take the effort setting is asked once more without it.
      if (statusOf(error) === 400 && !signal.aborted) return request();
      throw error;
    }
  };
  return {
    name: (system, prompt) =>
      call('lesson-planner-picture-editor', EDITOR_MS, system, prompt),
    look: (system, content) =>
      call('lesson-planner-picture-look', LOOK_MS, system, content),
  };
}
