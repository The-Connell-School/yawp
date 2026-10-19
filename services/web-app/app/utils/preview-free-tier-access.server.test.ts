import { expect, test } from 'bun:test';
import {
  classifyFreeTierPreviewSession,
  type FreeTierPreviewSession,
} from './preview-free-tier-access.server';

const grant = {
  kind: 'RELEASE' as const,
  tokenId: 'link-1',
  applicationId: 'application-1',
  issuedAt: 1,
};
const teacher: FreeTierPreviewSession = {
  user: {
    isAdmin: false,
    memberships: [
      {
        id: 'membership-1',
        role: 'TEACHER',
        organizationId: 'free-org',
        organization: { plan: 'FREE_CLASSROOM', previewSeatCode: null },
      },
    ],
  },
  application: {
    id: 'application-1',
    acquisitionTokenId: 'event-1',
    organizationId: 'free-org',
  },
};

test('only a grant-matching free-tier teacher can continue with a session', () => {
  expect(classifyFreeTierPreviewSession(null, null, grant)).toBe('denied');
  expect(classifyFreeTierPreviewSession(teacher, null, grant)).toBe('teacher');
  expect(classifyFreeTierPreviewSession(teacher, 'membership-1', grant)).toBe(
    'teacher'
  );
  expect(
    classifyFreeTierPreviewSession(teacher, 'other-membership', grant)
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(teacher, null, {
      ...grant,
      applicationId: 'another-application',
    })
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(teacher, null, {
      kind: 'acquisition',
      tokenId: 'event-1',
      issuedAt: 1,
    })
  ).toBe('teacher');
  expect(
    classifyFreeTierPreviewSession(teacher, null, {
      kind: 'acquisition',
      tokenId: 'other-event',
      issuedAt: 1,
    })
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(
      { ...teacher, application: null },
      null,
      grant
    )
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(
      { ...teacher, user: { ...teacher.user, isAdmin: true } },
      null,
      grant
    )
  ).toBe('denied');
  for (const changes of [
    { role: 'STUDENT' },
    { organizationId: 'another-org' },
    { organization: { plan: 'PAID', previewSeatCode: null } },
    { organization: { plan: 'FREE_CLASSROOM', previewSeatCode: 'seed-seat' } },
  ]) {
    const member = { ...teacher.user.memberships[0]!, ...changes };
    expect(
      classifyFreeTierPreviewSession(
        { ...teacher, user: { ...teacher.user, memberships: [member] } },
        null,
        grant
      )
    ).toBe('denied');
    expect(
      classifyFreeTierPreviewSession(
        {
          ...teacher,
          user: {
            ...teacher.user,
            memberships: [...teacher.user.memberships, member],
          },
        },
        null,
        grant
      )
    ).toBe('denied');
  }
  expect(
    classifyFreeTierPreviewSession(
      { ...teacher, user: { ...teacher.user, memberships: [] } },
      null,
      grant
    )
  ).toBe('teacher');
});
