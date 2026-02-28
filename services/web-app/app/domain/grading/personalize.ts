export function firstNameFromFullName(name: string | null | undefined) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Student';
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || 'Student';
}
