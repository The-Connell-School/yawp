/**
 * Take students' names out of their writing before it leaves the app. Papers
 * name the writer in headers and name classmates in the body, so every part
 * of every name on the roster is removed, wherever it appears.
 */
const PLACEHOLDER = '[name]';

function nameParts(name: string): string[] {
  const local = name.includes('@') ? name.slice(0, name.indexOf('@')) : name;
  return local
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scrubStudentNames(
  text: string,
  names: Array<string | null | undefined>
): string {
  const alternatives = [
    ...new Set(
      names.flatMap((name) => {
        const parts = name?.trim() ? nameParts(name.trim()) : [];
        // The whole name first, so "Ada Lovelace" becomes one placeholder.
        const whole =
          parts.length > 1 ? [parts.map(escapeRegExp).join('\\s+')] : [];
        return [...whole, ...parts.map(escapeRegExp)];
      })
    ),
  ]
    // Longest first, so "Annabel" is not left as "[name]bel" by "Anna".
    .sort((a, b) => b.length - a.length);
  if (alternatives.length === 0) return text;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`,
    'giu'
  );
  return text.replace(pattern, PLACEHOLDER);
}
