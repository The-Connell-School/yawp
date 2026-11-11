/**
 * Default Anthropic API model id when `AI_MODEL` is unset. Call sites should use
 * `process.env.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL` (or equivalent) so previews
 * and local overrides keep working.
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5' as const;
