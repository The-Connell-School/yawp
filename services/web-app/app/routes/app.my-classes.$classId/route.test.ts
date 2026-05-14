import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
  documentClassForensic: { findMany: mock() },
  assignmentType: { findMany: mock() },
  profile: { findMany: mock() },
  pasteAlert: { findMany: mock() },
  submission: { findMany: mock() },
  document: { findMany: mock() },
  assignment: { findMany: mock() },
};

const requireUserId = mock();
const requireProfile = mock();
const getSubmittedPapersFilter = mock();
const isDocumentSubmissionEnabledForSchool = mock();
const isAssignmentsEnabledForOrganization = mock();
const isReleasedGradesOrganizationEnabledForOrganization = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/cookies.server', () => ({
  getSubmittedPapersFilter,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
  isAssignmentsEnabledForOrganization,
  isReleasedGradesOrganizationEnabledForOrganization,
}));

const { loader } = await import('./route');

describe('class detail loader document visibility', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }
    requireUserId.mockReset();
    requireProfile.mockReset();
    getSubmittedPapersFilter.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    isAssignmentsEnabledForOrganization.mockReset();
    isReleasedGradesOrganizationEnabledForOrganization.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      grade: '9',
      period: '2',
      title: 'World History',
      school: { id: 'school-1', name: 'Tallassee High School', organizationId: 'org-1' },
      students: [],
    });
    prisma.documentClassForensic.findMany.mockResolvedValue([
      { documentId: 'legacy-doc-1' },
      { documentId: 'legacy-doc-2' },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.pasteAlert.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    getSubmittedPapersFilter.mockResolvedValue('all');
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    isAssignmentsEnabledForOrganization.mockResolvedValue(true);
    isReleasedGradesOrganizationEnabledForOrganization.mockResolvedValue(false);
  });

  test('includes legacy class documents preserved during assignment migration', async () => {
    await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    const expectedScope = {
      OR: [
        { assignment: { classId: 'class-1' } },
        { id: { in: ['legacy-doc-1', 'legacy-doc-2'] } },
      ],
    };

    expect(prisma.documentClassForensic.findMany).toHaveBeenCalledWith({
      where: { oldClassId: 'class-1' },
      select: { documentId: true },
    });
    expect(prisma.assignmentType.findMany).toHaveBeenCalledWith({
      where: {
        organizationAssignments: {
          some: { organizationId: 'org-1' },
        },
      },
      select: { id: true, title: true },
      orderBy: { position: 'asc' },
    });
    expect(prisma.profile.findMany.mock.calls[0][0].select.documents.where).toEqual(
      expectedScope
    );
    expect(prisma.pasteAlert.findMany.mock.calls[0][0].where.document).toEqual(
      expectedScope
    );
    expect(prisma.submission.findMany.mock.calls[0][0].where.document).toEqual(
      {
        is: {
          ...expectedScope,
          deletedAt: null,
        },
      }
    );
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
      ...expectedScope,
      deletedAt: null,
      archivedAt: null,
      submissions: { none: {} },
    });
  });
});
