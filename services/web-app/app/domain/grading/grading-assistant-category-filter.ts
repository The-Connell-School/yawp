/**
 * Drops category objects the assignment is not scoring (for example grammar when
 * the per-assignment grammar toggle is off). Extra keys from the model are
 * ignored rather than failing validation.
 */
export function preprocessGradingAssistantCategoriesInput(
  input: unknown,
  allowedKeys: readonly string[]
): unknown {
  if (!Array.isArray(input)) return input;
  const allowed = new Set(allowedKeys);
  return input.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const key = (item as { key?: unknown }).key;
    return typeof key === 'string' && allowed.has(key);
  });
}
