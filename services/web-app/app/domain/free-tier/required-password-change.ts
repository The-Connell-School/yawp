export function mayChangeRequiredPassword(user: {
  mustChangePassword: boolean;
}): boolean {
  return user.mustChangePassword;
}
