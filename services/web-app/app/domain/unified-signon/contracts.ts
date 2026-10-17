/** Presentation only. Server responses must derive these from verified context,
 * never from a posted screen, email, role, class ID, or membership ID alone. */
export type SignonScreen =
  | 'entry'
  | 'password'
  | 'required-password'
  | 'account-type'
  | 'class-code'
  | 'email-code'
  | 'name-password'
  | 'handle-join'
  | 'teacher'
  | 'trial-status'
  | 'activation'
  | 'inactive'
  | 'membership'
  | 'link-google'
  | 'partner-code'
  | 'class-found'
  | 'class-handle'
  | 'class-email'
  | 'class-signin'
  | 'joined'
  | 'ambiguity';

export type SignonClass = {
  id: string;
  name: string;
  teacher: string;
  organization: string;
  accountMode?: 'handle' | 'email';
};
export type SignonMembership = {
  id: string;
  organization: string;
  role: string;
};
export type SignonState = {
  screen: SignonScreen;
  identifier?: string;
  provider?: 'google';
  /** Display context only; never email proof or an account identity. */
  emailOrigin?: boolean;
  organizationName?: string;
  adminName?: string;
  sentDate?: string;
  /** Opaque, expiring server context; never authorization by itself. PR 3. */
  flowToken?: string;
  classInfo?: SignonClass;
  classes?: SignonClass[];
  memberships?: SignonMembership[];
  handleSuggestions?: string[];
  variant?: string;
  notice?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
  pending?: boolean;
};

export type SignonOperation =
  | 'student-email'
  | 'class-email-signin'
  | 'student-choice'
  | 'register-student'
  | 'student-password'
  | 'complete-student'
  | 'resolve'
  | 'password'
  | 'required-password'
  | 'resolve-class'
  | 'choose-class'
  | 'send-code'
  | 'verify-code'
  | 'resend-code'
  | 'create-account'
  | 'join-handle'
  | 'select-membership'
  | 'google'
  | 'link-google'
  | 'skip-google'
  | 'partner-code'
  | 'trial-status'
  | 'resend-invite'
  | 'resend-approval';

export type SignonResult =
  | { redirectTo: string }
  | { state: SignonState }
  | {
      error: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };
export type SignonTransport = (
  operation: SignonOperation,
  values: Record<string, string>,
  context: { state: SignonState; redirectTo: string }
) => Promise<SignonResult>;

/** Pure UI hint only. Live resolution must check both class and handle matches. */
export function identifierKind(
  raw: string
): 'empty' | 'email' | 'handle-or-code' {
  const value = raw.trim();
  if (!value) return 'empty';
  return value.includes('@') && !value.startsWith('@')
    ? 'email'
    : 'handle-or-code';
}
