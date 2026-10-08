/**
 * Decode a React Router single-fetch `.data` response (turbo-stream line array).
 */
export function decodeRouterDataResponse(body: string): unknown {
  const line = JSON.parse(body) as unknown[];
  const visiting = new Set<number>();
  const root = decodeTurboLine(line, 0, visiting);
  if (root && typeof root === 'object' && 'loaderData' in root) {
    return (root as { loaderData: unknown }).loaderData;
  }
  return root;
}

function followTurboRef(
  line: unknown[],
  index: number,
  visiting: Set<number>
): unknown {
  if (!Number.isInteger(index) || index < 0 || index >= line.length) {
    return index;
  }
  const target = line[index];
  if (target !== null && typeof target === 'object') {
    return decodeTurboLine(line, index, visiting);
  }
  return index;
}

function decodeTurboLine(
  line: unknown[],
  index: number,
  visiting: Set<number>
): unknown {
  if (index < 0 || index >= line.length) return undefined;
  if (visiting.has(index)) return line[index];
  visiting.add(index);

  const value = line[index];
  if (value === undefined || value === null) {
    visiting.delete(index);
    return value;
  }

  if (Array.isArray(value)) {
    if (value[0] === 'D' && typeof value[1] === 'number') {
      visiting.delete(index);
      return new Date(value[1]);
    }
    const decoded = value.map((item) =>
      typeof item === 'number' ? decodeTurboLine(line, item, visiting) : item
    );
    visiting.delete(index);
    return decoded;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.every((key) => key.startsWith('_'))) {
      const arrayIndices = keys
        .map((key) => Number(key.slice(1)))
        .filter((index) => Number.isInteger(index));
      const isDenseArray =
        arrayIndices.length === keys.length &&
        arrayIndices.length > 0 &&
        arrayIndices.every((index, position) => index === position);
      if (isDenseArray) {
        const decoded = arrayIndices.map((index) =>
          decodeTurboLine(line, record[`_${index}`] as number, visiting)
        );
        visiting.delete(index);
        return decoded;
      }

      const out: Record<string, unknown> = {};
      for (const [propRef, valRef] of Object.entries(record)) {
        const keyIndex = Number(propRef.slice(1));
        out[String(decodeTurboLine(line, keyIndex, visiting))] = decodeTurboLine(
          line,
          valRef as number,
          visiting
        );
      }
      visiting.delete(index);
      return out;
    }
  }

  visiting.delete(index);
  if (typeof value === 'number') {
    return followTurboRef(line, value, visiting);
  }
  return value;
}

export function getRouteLoaderData(
  loaderData: unknown,
  routeIdSuffix: string
): Record<string, unknown> {
  const root = loaderData as Record<string, unknown>;
  const key = Object.keys(root).find((candidate) =>
    candidate.endsWith(routeIdSuffix)
  );
  if (!key) {
    throw new Error(
      `Route loader data not found for suffix "${routeIdSuffix}" (keys: ${Object.keys(root).join(', ')})`
    );
  }
  return root[key] as Record<string, unknown>;
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
