function tryParseJson(
  value: string
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function findMatchingJsonEnd(source: string, startIndex: number): number {
  const startChar = source[startIndex];
  if (startChar !== '{' && startChar !== '[') return -1;

  const stack: string[] = [startChar];
  let inString = false;
  let escaped = false;

  for (let i = startIndex + 1; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (!open) return -1;
      if ((open === '{' && ch !== '}') || (open === '[' && ch !== ']')) {
        return -1;
      }
      if (stack.length === 0) return i;
    }
  }

  return -1;
}

export function parseFirstJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed) {
    const direct = tryParseJson(trimmed);
    if (direct.ok) return direct.value;
  }

  const fencedBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let fencedMatch: RegExpExecArray | null;
  while ((fencedMatch = fencedBlockRegex.exec(text))) {
    const candidate = fencedMatch[1]?.trim();
    if (!candidate) continue;
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return parsed.value;
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = findMatchingJsonEnd(text, i);
    if (end === -1) continue;
    const candidate = text.slice(i, end + 1);
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return parsed.value;
  }

  throw new Error('No parseable JSON value found in response');
}

export function extractJsonObjectCandidates(text: string): unknown[] {
  const candidates: unknown[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const end = findMatchingJsonEnd(text, i);
    if (end === -1) continue;
    const parsed = tryParseJson(text.slice(i, end + 1));
    if (parsed.ok) candidates.push(parsed.value);
  }
  return candidates;
}
