export function safeInAppNavigationTarget(
  exitTo: string | null | undefined
): string | null {
  if (!exitTo) return null;
  if (
    !exitTo.startsWith('/') ||
    exitTo.startsWith('//') ||
    exitTo.includes('\\')
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(exitTo, 'https://yawp.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://yawp.invalid') return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path === '/app/assignments/new' || path.startsWith('/app/assignments/new?')) {
    return null;
  }
  return path;
}

export type PostCreateAssignmentDestination =
  | { kind: 'back' }
  | { kind: 'navigate'; url: string };

export function resolvePostCreateAssignmentNavigation(input: {
  assignmentId: string;
  priorAssignmentCount: number;
  classId: string | null;
  exitTo: string | null | undefined;
  canGoBack: boolean;
}): PostCreateAssignmentDestination {
  if (input.priorAssignmentCount === 0 && input.classId) {
    const params = new URLSearchParams({
      firstAssignment: input.assignmentId,
      firstAssignmentClassId: input.classId,
    });
    return { kind: 'navigate', url: `/app?${params.toString()}` };
  }

  const exitTarget = safeInAppNavigationTarget(input.exitTo);
  if (exitTarget) {
    return { kind: 'navigate', url: exitTarget };
  }

  if (input.canGoBack) {
    return { kind: 'back' };
  }

  return {
    kind: 'navigate',
    url: `/app/assignments/${input.assignmentId}`,
  };
}
