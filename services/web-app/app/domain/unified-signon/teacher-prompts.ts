export type TeacherPromptAccount = {
  kind: 'email-student' | 'handle-only' | 'neutral' | 'staff';
  identifier: string;
};

/** Use stored account data, never the identifier posted by a client. */
export function teacherPromptAccount(user: {
  email: string | null;
  username: string | null;
  roles: readonly string[];
}): TeacherPromptAccount {
  return {
    kind: user.roles.includes('TEACHER')
      ? 'staff'
      : !user.email && user.username
        ? 'handle-only'
        : user.roles.length === 0
          ? 'neutral'
          : 'email-student',
    identifier: user.email || (user.username ? `@${user.username}` : ''),
  };
}

/** Deliberately accepts one literal path; no normalization or URL parsing. */
export function signoutDestination(value: unknown): '/free' | '/auth/login' {
  return value === '/free' ? '/free' : '/auth/login';
}
