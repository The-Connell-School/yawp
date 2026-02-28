const moduleTitleSelection = {
  studentCourseModule: { select: { title: true } },
} as const;

export const studentModuleSessionSingleSelect = {
  select: moduleTitleSelection,
  orderBy: { studentCourseModule: { position: 'desc' } },
  take: 1,
} as const;

export const studentModuleSessionListSelect = {
  select: moduleTitleSelection,
  orderBy: { studentCourseModule: { position: 'desc' } },
} as const;
