type AssignmentModule = {
  id: string;
  position: number;
  deletedAt?: string | Date | null;
};

type TutorCmsForNavigation = {
  assignmentModuleId?: string | null;
  assignmentModule?: {
    id?: string | null;
    position?: number | null;
    assignmentType?: {
      assignmentModules?: AssignmentModule[] | null;
    } | null;
  } | null;
};

export function getNavigableAssignmentModules<
  T extends AssignmentModule,
>(modules: T[] | null | undefined): T[] {
  const list = modules ?? [];
  return [...list]
    .filter((module) => module.deletedAt == null)
    .sort((a, b) => a.position - b.position);
}

function resolveCurrentModuleIndex(
  orderedModules: AssignmentModule[],
  cms: TutorCmsForNavigation
) {
  const currentModuleId =
    cms.assignmentModuleId ?? cms.assignmentModule?.id ?? null;
  if (currentModuleId) {
    const currentIndex = orderedModules.findIndex(
      (module) => module.id === currentModuleId
    );
    if (currentIndex >= 0) return currentIndex;
  }

  const currentPosition = cms.assignmentModule?.position;
  if (typeof currentPosition === 'number') {
    return orderedModules.findIndex(
      (module) => module.position === currentPosition
    );
  }

  return -1;
}

export function getNextAssignmentModuleId(
  cms: TutorCmsForNavigation,
  fallbackNextModuleId?: string
) {
  const orderedModules = getNavigableAssignmentModules(
    cms.assignmentModule?.assignmentType?.assignmentModules
  );
  if (orderedModules.length === 0) return fallbackNextModuleId;

  const currentIndex = resolveCurrentModuleIndex(orderedModules, cms);
  if (currentIndex >= 0) {
    return orderedModules[currentIndex + 1]?.id;
  }

  const currentPosition = cms.assignmentModule?.position;
  if (typeof currentPosition === 'number') {
    return orderedModules.find((module) => module.position > currentPosition)
      ?.id;
  }

  return fallbackNextModuleId;
}

export function getPreviousAssignmentModuleId(cms: TutorCmsForNavigation) {
  const orderedModules = getNavigableAssignmentModules(
    cms.assignmentModule?.assignmentType?.assignmentModules
  );
  const currentIndex = resolveCurrentModuleIndex(orderedModules, cms);
  if (currentIndex <= 0) return undefined;
  return orderedModules[currentIndex - 1]?.id;
}

/** Maps tutor `cmsIdx` (navigable session order) to a module id. */
export function getAssignmentModuleIdForCmsIdx(
  cms: TutorCmsForNavigation,
  cmsIdx: number
) {
  const orderedModules = getNavigableAssignmentModules(
    cms.assignmentModule?.assignmentType?.assignmentModules
  );
  if (cmsIdx < 0) return undefined;
  return orderedModules[cmsIdx]?.id;
}
