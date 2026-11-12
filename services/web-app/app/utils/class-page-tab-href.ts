export type MyClassTeacherTab = 'students' | 'documents' | 'assignments';
export type MyClassStudentTab = 'assignments' | 'documents';

export function buildMyClassTabHref(
  classId: string,
  tab: MyClassTeacherTab | MyClassStudentTab
) {
  return {
    pathname: `/app/my-classes/${classId}`,
    search: `?tab=${tab}`,
  };
}
