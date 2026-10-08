/**
 * Decode a React Router single-fetch `.data` response (turbo-stream line array).
 */
export function decodeRouterDataResponse(body: string): unknown {
  const line = JSON.parse(body) as unknown[];
  const root = decodeTurboLine(line, 0);
  if (root && typeof root === 'object' && 'loaderData' in root) {
    return (root as { loaderData: unknown }).loaderData;
  }
  return root;
}

function decodeTurboLine(line: unknown[], index: number): unknown {
  const value = line[index];
  if (value === undefined || value === null) return value;

  if (Array.isArray(value)) {
    if (value[0] === 'D' && typeof value[1] === 'number') {
      return new Date(value[1]);
    }
    return value;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).every((key) => key.startsWith('_'))) {
      const out: Record<string, unknown> = {};
      for (const [propRef, valRef] of Object.entries(record)) {
        const keyIndex = Number(propRef.slice(1));
        out[String(decodeTurboLine(line, keyIndex))] = decodeTurboLine(
          line,
          valRef as number
        );
      }
      return out;
    }
  }

  return value;
}

export function findObjectsWithId(
  root: unknown,
  id: string
): Record<string, unknown>[] {
  const matches: Record<string, unknown>[] = [];
  walkTurboDecoded(root, (value) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as { id?: unknown }).id === id
    ) {
      matches.push(value as Record<string, unknown>);
    }
  });
  return matches;
}

export function walkTurboDecoded(value: unknown, visit: (v: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkTurboDecoded(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) walkTurboDecoded(item, visit);
  }
}
