/**
 * A soft reminder, never a block: teachers at other schools read the Lounge,
 * so the composer points out text that looks like it identifies a student or
 * a family. False positives cost one sentence of grey text.
 */
export type PrivacyConcern = 'email' | 'phone' | 'student-name';

const CHECKS: Array<[PrivacyConcern, RegExp]> = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['phone', /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/],
  [
    'student-name',
    /\b(?:[Ss]tudent|[Kk]id|[Bb]oy|[Gg]irl)\s+(?:named\s+|called\s+)?[A-Z][a-z]+\b/,
  ],
];

export function findPrivacyConcerns(text: string): PrivacyConcern[] {
  return CHECKS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}

export function privacyConcernMessage(concerns: PrivacyConcern[]): string | null {
  if (concerns.length === 0) return null;
  const what = concerns.includes('student-name')
    ? "a student's name"
    : concerns.includes('email')
      ? 'an email address'
      : 'a phone number';
  return `This looks like it may include ${what}. Teachers at other schools will see this post.`;
}
