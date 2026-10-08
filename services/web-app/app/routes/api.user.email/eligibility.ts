export function canRequestAccountEmail(user: { email: string | null }) {
  return user.email === null;
}
