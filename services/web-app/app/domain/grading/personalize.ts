export function firstNameFromFullName(name: string | null | undefined) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Student';
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || 'Student';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function personalizeOverallComment(firstName: string, raw: string) {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return '';
  if (!firstName) return cleaned;

  const prefix = `${firstName},`;
  if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
    const staticLeadInRegex = new RegExp(
      `^${escapeRegExp(firstName)},\\s*this\\s+is\\s+your\\s+overall\\s+feedback\\.?\\s*`,
      'i'
    );
    const withoutStaticLeadIn = cleaned.replace(staticLeadInRegex, '').trim();
    if (withoutStaticLeadIn) {
      return `${prefix} ${withoutStaticLeadIn}`;
    }
    return cleaned;
  }

  if (cleaned.toLowerCase().startsWith('overall grade,')) {
    const withoutLegacyPrefix = cleaned.replace(/^overall grade,\s*/i, '').trim();
    return withoutLegacyPrefix ? `${prefix} ${withoutLegacyPrefix}` : prefix;
  }

  return `${prefix} ${cleaned}`;
}
