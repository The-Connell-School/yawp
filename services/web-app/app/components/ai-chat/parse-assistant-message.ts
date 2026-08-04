/**
 * Pull an optional ```suggestions fenced block off an assistant message. Each
 * line becomes a clickable chip in the UI; the block itself is stripped from
 * the rendered body so it never shows as raw text.
 */
export function parseAssistantMessage(content: string): {
  body: string;
  suggestions: string[];
} {
  const match = content.match(/```suggestions\s*\n([\s\S]*?)```/i);
  if (!match) return { body: content, suggestions: [] };

  const suggestions = match[1]
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  const body = content.replace(match[0], '').trim();
  return { body, suggestions };
}
