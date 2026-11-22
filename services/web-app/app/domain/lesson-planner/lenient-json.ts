/**
 * A small model's JSON answer, read leniently: the first balanced `{…}` in
 * the text that the schema accepts. An answer can carry a sentence before
 * the JSON, a code fence around it, or a note with braces after it; the span
 * from the first `{` to the last `}` would then not parse (the second look on
 * the preview, Nov 22, answered without error and nothing could be read).
 */
import type { z } from 'zod';

/** Every balanced `{…}` in the text, outermost first, skipping braces inside strings. */
export function jsonObjectSpans(text: string): string[] {
  const spans: string[] = [];
  for (
    let start = text.indexOf('{');
    start >= 0;
    start = text.indexOf('{', start + 1)
  ) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          spans.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return spans;
}

/** The first JSON object in the text that the schema accepts, or null. */
export function readLenientJson<S extends z.ZodTypeAny>(
  text: string,
  schema: S
): z.output<S> | null {
  for (const span of jsonObjectSpans(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(span);
    } catch {
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return result.data as z.output<S>;
  }
  return null;
}
