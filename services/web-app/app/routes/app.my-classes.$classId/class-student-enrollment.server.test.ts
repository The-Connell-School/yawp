import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUnique: mock() },
  orgMembership: { update: mock(), create: mock() },
  invitation: { findFirst: mock(), delete: mock(), create: mock() },
  organization: { findUnique: mock() },
};

const generateTOTP = mock();
const sendEmail = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/totp.server.ts', () => ({ generateTOTP }));
mock.module('~/utils/totp.server', () => ({ generateTOTP }));
mock.module('~/utils/email.server.ts', () => ({ sendEmail }));
mock.module('~/utils/email.server', () => ({ sendEmail }));

const {
  lookupStudentEmailForClass,
  enrollExistingStudentInClass,
  sendStudentClassInvite,
} = await import('./class-student-enrollment.server.tsx');

describe('lookupStudentEmailForClass', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.orgMembership.create.mockReset();
  });

  test('returns needs_invite when the email has no account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await lookupStudentEmailForClass({
      email: 'new@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'needs_invite',
      email: 'new@example.com',
    });
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('returns existing when the student can be added to the class', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          classesAsStudent: [],
        },
      ],
    });

    const result = await lookupStudentEmailForClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'existing',
      email: 'student@example.com',
    });
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('returns an error when the user has no student membership in the organization', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [],
    });

    const result = await lookupStudentEmailForClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'error',
      error: 'This user belongs to another organization.',
    });
    expect(prisma.orgMembership.create).not.toHaveBeenCalled();
  });

  test('returns already_enrolled when the student is already in the class', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          classesAsStudent: [{ id: 'class-1' }],
        },
      ],
    });

    const result = await lookupStudentEmailForClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'already_enrolled',
      email: 'student@example.com',
      message: 'Student is already in this class.',
    });
  });

  test('returns an error when the user belongs to another organization', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-2',
          classesAsStudent: [],
        },
      ],
    });

    const result = await lookupStudentEmailForClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'error',
      error: 'This user belongs to another organization.',
    });
  });
});

describe('enrollExistingStudentInClass', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.orgMembership.create.mockReset();
  });

  test('enrolls an existing student membership in the class', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          classesAsStudent: [],
        },
      ],
    });
    prisma.orgMembership.update.mockResolvedValue({});

    const result = await enrollExistingStudentInClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({ status: 'enrolled' });
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: { classesAsStudent: { connect: { id: 'class-1' } } },
    });
  });

  test('returns an error when the user has no student membership in the organization', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [],
    });

    const result = await enrollExistingStudentInClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'error',
      error: 'This user belongs to another organization.',
    });
    expect(prisma.orgMembership.create).not.toHaveBeenCalled();
  });
});

describe('sendStudentClassInvite', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
    prisma.invitation.create.mockReset();
    prisma.organization.findUnique.mockReset();
    generateTOTP.mockReset();
    sendEmail.mockReset();

    generateTOTP.mockResolvedValue({
      otp: 'ABC123',
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 259200,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({ id: 'inv-1' });
    prisma.organization.findUnique.mockResolvedValue({ name: 'E2E High' });
    sendEmail.mockResolvedValue({ status: 'success' });
  });

  test('creates an onboard-student invitation scoped to the class', async () => {
    const request = new Request('https://example.test/app/my-classes/class-1');

    const result = await sendStudentClassInvite({
      email: 'new@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
      request,
    });

    expect(result).toEqual({
      status: 'invited',
      email: 'new@example.com',
    });
    expect(prisma.invitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'onboard-student',
        target: 'new@example.com',
        metadata: JSON.stringify({ klassId: 'class-1' }),
      }),
    });
    expect(sendEmail).toHaveBeenCalled();
  });

  test('returns an error when the account already exists', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    const result = await sendStudentClassInvite({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
      request: new Request('https://example.test/app/my-classes/class-1'),
    });

    expect(result).toEqual({
      status: 'error',
      error:
        'This student already has an account. Add them to the class instead.',
    });
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });
});
