type NullableString = string | null | undefined;

export function resolveGradeEssayContent(source: {
  essayText?: NullableString;
  essayHtml?: NullableString;
  snapshot?: {
    text?: NullableString;
    html?: NullableString;
  } | null;
}) {
  return {
    essayText: source.essayText ?? source.snapshot?.text ?? '',
    essayHtml: source.essayHtml ?? source.snapshot?.html ?? '',
  };
}
