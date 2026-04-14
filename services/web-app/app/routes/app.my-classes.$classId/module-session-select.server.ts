const moduleTitleSelection = {
  assignmentModule: { select: { title: true } },
} as const;

export const studentModuleSessionSingleSelect = {
  select: moduleTitleSelection,
  orderBy: { assignmentModule: { position: 'desc' } },
  take: 1,
} as const;

export const studentModuleSessionListSelect = {
  select: moduleTitleSelection,
  orderBy: { assignmentModule: { position: 'desc' } },
} as const;
