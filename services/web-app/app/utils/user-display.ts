export type UserDisplayFields = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
};

/** Primary label for rosters and UI: name, else email, else @handle. */
export function formatUserDisplayName(user: UserDisplayFields): string {
  const name = user.name?.trim();
  if (name) return name;
  if (user.email) return user.email;
  if (user.username) return `@${user.username}`;
  return 'Unknown user';
}

/** Secondary line or sort key: email if present, else @handle. */
export function formatUserContactLabel(user: UserDisplayFields): string {
  if (user.email) return user.email;
  if (user.username) return `@${user.username}`;
  return '';
}

export function formatUserAtHandle(username: string): string {
  return `@${username}`;
}
