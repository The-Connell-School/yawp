import type { GrammarHighlightMode } from '~/domain/rubrics/output-schema-display';

export function grammarHighlightGrammarTabLabel(
  mode: GrammarHighlightMode,
  explicitDisplayConfiguration: boolean
): string {
  if (!explicitDisplayConfiguration) return 'Grammar';
  if (mode === 'highlight') return 'Grammar (marked only)';
  if (mode === 'deduct') return 'Grammar (affects grade)';
  return 'Grammar';
}

export function grammarHighlightCaption(
  mode: GrammarHighlightMode,
  explicitDisplayConfiguration: boolean
): string | null {
  if (!explicitDisplayConfiguration) return null;
  if (mode === 'highlight') {
    return "Grammar is marked but doesn't lower the grade unless it obscures meaning.";
  }
  if (mode === 'deduct') {
    return 'Grammar issues are highlighted and may lower the score.';
  }
  return null;
}
