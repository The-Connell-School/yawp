export function shouldRedirectClasslessStudent({
  role,
  isOrgOwner,
  classCount,
  pathname,
}: {
  role: string;
  isOrgOwner: boolean;
  classCount: number;
  pathname: string;
}) {
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;

  return (
    role === 'STUDENT' &&
    !isOrgOwner &&
    classCount === 0 &&
    normalizedPath !== '/app'
  );
}
