/** Who may open Contact Us outside the Faculty Lounge (/app/contact). */
export function decideContactAccess(input: {
  role: string;
  isActive: boolean;
  isAdmin: boolean;
  flagOn: boolean;
}): boolean {
  if (input.isAdmin) return true;
  return input.flagOn && input.isActive && input.role === 'TEACHER';
}

/** Where "back" goes after Contact Us: a page in the app, else the dashboard. */
export function safeContactReturnPath(value: string | null | undefined): string {
  return value && /^\/app(\/[\w\-/]*)?$/.test(value) ? value : '/app';
}
