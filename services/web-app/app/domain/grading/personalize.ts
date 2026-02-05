export function firstNameFromFullName(name: string | null | undefined) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'there';
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || 'there';
}

export function personalizeOverallComment(firstName: string, raw: string) {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return `Overall grade, ${firstName},`;

  const prefix = `Overall grade, ${firstName},`;
  if (cleaned.toLowerCase().startsWith('overall grade,')) {
    return cleaned;
  }
  return `${prefix} ${cleaned}`;
}

