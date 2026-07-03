export type AssignmentModuleSessionResumeCandidate = {
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  instructionsCompleted: number;
  assignmentModule?: {
    position?: number | null;
    instructions?: unknown[] | null;
  } | null;
};

function dateTimeValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function modulePosition(
  session: AssignmentModuleSessionResumeCandidate,
  fallback: number
) {
  const position = session.assignmentModule?.position;
  return typeof position === 'number' && Number.isFinite(position)
    ? position
    : fallback;
}

function orderAssignmentModuleSessionsByPosition<
  T extends AssignmentModuleSessionResumeCandidate,
>(sessions: T[]) {
  return sessions
    .map((session, index) => ({
      session,
      index,
      position: modulePosition(session, index),
    }))
    .sort((a, b) => a.position - b.position || a.index - b.index)
    .map(({ session }) => session);
}

function wasSessionTouched(session: AssignmentModuleSessionResumeCandidate) {
  const createdAt = dateTimeValue(session.createdAt);
  const updatedAt = dateTimeValue(session.updatedAt);
  return createdAt != null && updatedAt != null && updatedAt > createdAt;
}

function isSessionComplete(session: AssignmentModuleSessionResumeCandidate) {
  const instructionCount = session.assignmentModule?.instructions?.length ?? 0;
  return (
    instructionCount > 0 && session.instructionsCompleted >= instructionCount
  );
}

export function resolveCurrentAssignmentModuleSession<
  T extends AssignmentModuleSessionResumeCandidate,
>(sessions: T[], explicitCmsIdx: number | null) {
  const orderedSessions = orderAssignmentModuleSessionsByPosition(sessions);

  if (explicitCmsIdx != null) {
    const explicitIndex = explicitCmsIdx >= 0 ? explicitCmsIdx : 0;
    const currentCms =
      orderedSessions[explicitIndex] ?? orderedSessions[0] ?? null;
    return {
      currentCms,
      currentCmsIdx: currentCms ? orderedSessions.indexOf(currentCms) : -1,
    };
  }

  const touched = orderedSessions
    .map((session, index) => ({
      session,
      index,
      updatedAt: dateTimeValue(session.updatedAt) ?? 0,
      position: modulePosition(session, index),
    }))
    .filter(({ session }) => wasSessionTouched(session))
    .sort(
      (a, b) =>
        b.updatedAt - a.updatedAt ||
        b.position - a.position ||
        b.index - a.index
    );

  if (touched[0]) {
    return { currentCms: touched[0].session, currentCmsIdx: touched[0].index };
  }

  const firstIncompleteIndex = orderedSessions.findIndex(
    (session) => !isSessionComplete(session)
  );
  const resumeIndex =
    firstIncompleteIndex >= 0
      ? firstIncompleteIndex
      : orderedSessions.length - 1;

  return {
    currentCms: resumeIndex >= 0 ? orderedSessions[resumeIndex] : null,
    currentCmsIdx: resumeIndex,
  };
}

export function orderAssignmentModuleSessionsForCurrentStep<
  T extends AssignmentModuleSessionResumeCandidate,
>(sessions: T[]) {
  const orderedSessions = orderAssignmentModuleSessionsByPosition(sessions);
  const { currentCms } = resolveCurrentAssignmentModuleSession(
    orderedSessions,
    null
  );

  if (!currentCms) return orderedSessions;

  return [
    currentCms,
    ...orderedSessions.filter((session) => session !== currentCms),
  ];
}
