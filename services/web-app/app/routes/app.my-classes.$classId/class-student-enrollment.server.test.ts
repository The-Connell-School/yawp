import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findFirst: mock() },
  orgMembership: { update: mock(), create: mock() },
  invitation: { findFirst: mock(), delete: mock(), create: mock() },
  organization: { findUnique: mock() },
  $transaction: mock(),
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
    prisma.user.findFirst.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.orgMembership.create.mockReset();
  });

  test('returns needs_invite when the email has no account', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

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
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
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

  test('returns existing when the student is enrolled in a different class', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
          classesAsStudent: [{ id: 'class-2' }],
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
  });

  test('matches an existing account whose stored email differs in case', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
          classesAsStudent: [],
        },
      ],
    });

    const result = await lookupStudentEmailForClass({
      email: '  Student@Example.com ',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'existing',
      email: 'student@example.com',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: 'student@example.com', mode: 'insensitive' },
        },
      })
    );
  });

  test('returns an error when the user has no membership in the organization', async () => {
    prisma.user.findFirst.mockResolvedValue({
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

  test('returns a role-specific error when the account is not a student account', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'teacher-1',
          organizationId: 'org-1',
          role: 'TEACHER',
          classesAsStudent: [],
        },
      ],
    });

    const result = await lookupStudentEmailForClass({
      email: 'teacher@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'error',
      error: 'This email belongs to a staff account, not a student account.',
    });
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('returns already_enrolled when the student is already in the class', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
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
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-2',
          role: 'STUDENT',
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
    prisma.user.findFirst.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.orgMembership.create.mockReset();
  });

  test('enrolls an existing student membership in the class', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
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

  test('adds a student who is already in another class without removing that class', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
          classesAsStudent: [{ id: 'class-2' }],
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

  test('is a no-op when the student is already in this class', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
          classesAsStudent: [{ id: 'class-1' }],
        },
      ],
    });

    const result = await enrollExistingStudentInClass({
      email: 'student@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'enrolled',
      message: 'Student is already in this class.',
    });
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('enrolls an account whose stored email differs in case', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'student-1-user',
      memberships: [
        {
          id: 'student-1',
          organizationId: 'org-1',
          role: 'STUDENT',
          classesAsStudent: [],
        },
      ],
    });
    prisma.orgMembership.update.mockResolvedValue({});

    const result = await enrollExistingStudentInClass({
      email: 'Student@Example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({ status: 'enrolled' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: 'student@example.com', mode: 'insensitive' },
        },
      })
    );
  });

  test('returns an error when the user has no membership in the organization', async () => {
    prisma.user.findFirst.mockResolvedValue({
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

  test('returns a role-specific error when the account is not a student account', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'teacher-1',
          organizationId: 'org-1',
          role: 'TEACHER',
          classesAsStudent: [],
        },
      ],
    });

    const result = await enrollExistingStudentInClass({
      email: 'teacher@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      status: 'error',
      error: 'This email belongs to a staff account, not a student account.',
    });
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });
});

describe('sendStudentClassInvite', () => {
  beforeEach(() => {
    prisma.user.findFirst.mockReset();
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
    prisma.invitation.create.mockReset();
    prisma.organization.findUnique.mockReset();
    prisma.$transaction.mockReset();
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
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({ id: 'inv-1' });
    prisma.$transaction.mockImplementation(async (operations: unknown[]) =>
      Promise.all(operations)
    );
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
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

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

  test('refuses to invite an account whose stored email differs in case', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

    const result = await sendStudentClassInvite({
      email: 'Student@Example.com',
      classId: 'class-1',
      organizationId: 'org-1',
      request: new Request('https://example.test/app/my-classes/class-1'),
    });

    expect(result).toEqual({
      status: 'error',
      error:
        'This student already has an account. Add them to the class instead.',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: 'student@example.com', mode: 'insensitive' },
        },
      })
    );
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  test('refuses to overwrite a pending UA onboarding invitation', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'ua-invite',
      metadata: JSON.stringify({ partner: 'ua', organizationId: 'org-ua' }),
    });

    const result = await sendStudentClassInvite({
      email: 'new@example.com',
      classId: 'class-1',
      organizationId: 'org-1',
      request: new Request('https://example.test/app/my-classes/class-1'),
    });

    expect(result.status).toBe('error');
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });
});
