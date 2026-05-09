type AssignmentModule = {
  id: string;
  position: number;
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

export function getNextAssignmentModuleId(
  cms: TutorCmsForNavigation,
  fallbackNextModuleId?: string
) {
  const modules = cms.assignmentModule?.assignmentType?.assignmentModules ?? [];
  if (modules.length === 0) return fallbackNextModuleId;

  const orderedModules = [...modules].sort((a, b) => a.position - b.position);
  const currentModuleId =
    cms.assignmentModuleId ?? cms.assignmentModule?.id ?? null;
  const currentIndex = currentModuleId
    ? orderedModules.findIndex((module) => module.id === currentModuleId)
    : -1;

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
