/**
 * Anthropic Claude 5.x models reject non-default `temperature`, `top_p`, and
 * `top_k` (HTTP 400 invalid_request_error). Omit sampling params for those ids.
 */
export function anthropicModelRejectsCustomSampling(model: string): boolean {
  return /^claude-[a-z]+-5-/.test(model);
}

export function anthropicSamplingParams(
  model: string,
  temperature: number | undefined
): { temperature?: number } {
  if (anthropicModelRejectsCustomSampling(model)) {
    return {};
  }
  return { temperature: temperature ?? 0.6 };
}
