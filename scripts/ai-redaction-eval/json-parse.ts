/**
 * Minimal, dependency-free JSON extraction for grading-assistant responses.
 *
 * The real app's `parseFirstJsonValue` (app/utils/llm-json.server.ts) does the
 * same job for the live route. This harness intentionally does not import
 * that file: it is `.server.ts`-suffixed app plumbing wired to request
 * context, and re-implementing the narrow "find the first JSON value in a
 * blob of model text" behavior here keeps the eval script dependency-free
 * and easy to run standalone. Behavior is deliberately conservative: try a
 * straight `JSON.parse` first, then fall back to extracting the first
 * balanced `{...}` object out of surrounding prose/markdown fences.
 */
export function extractFirstJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace-matching
  }

  const start = trimmed.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
