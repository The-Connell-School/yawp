import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
  },
  document: {
    findFirst: mock(),
    updateMany: mock(),
    findUniqueOrThrow: mock(),
  },
  submission: {
    create: mock(),
    count: mock(),
  },
  freeTierApplication: {
    findFirst: mock(),
  },
  documentWriteJournal: {
    create: mock(),
    update: mock(),
  },
  submissionActivity: { create: mock() },
  $transaction: mock(),
  $executeRaw: mock(),
};

const requireUserId = mock();
const requireMembership = mock();
const captureFreeTierAnalyticsEvent = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/services/posthog.server', () => ({
  posthog: { capture: captureFreeTierAnalyticsEvent, alias: mock() },
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (to: string, payload: unknown) =>
    new Response(JSON.stringify({ to, payload }), {
      status: 302,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

const { action } = await import('./route');

describe('api.domain.submit-document', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.document.updateMany.mockReset();
    prisma.document.findUniqueOrThrow.mockReset();
    prisma.submission.create.mockReset();
    prisma.submission.count.mockReset();
    prisma.freeTierApplication.findFirst.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    prisma.submissionActivity.create.mockReset();
    prisma.$transaction.mockReset();
    prisma.$executeRaw.mockReset().mockResolvedValue(1);
    requireUserId.mockReset();
    requireMembership.mockReset();
    captureFreeTierAnalyticsEvent.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
      isOrgOwner: false,
      organization: {
        id: 'org-1',
        name: 'Org',
        revisionFlowEnabled: false,
      },
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submissions: [],
      revision: 4,
      updatedAt: new Date('2026-08-20T11:59:00.000Z'),
      classAssignment: null,
      membership: {
        organizationId: 'org-1',
        organization: { plan: 'SCHOOL' },
        classesAsStudent: [
          {
            id: 'class-1',
            schoolId: 'school-1',
            school: { organizationId: 'org-1' },
            teachers: [{ id: 'teacher-1' }],
          },
        ],
      },
    });
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.findUniqueOrThrow.mockResolvedValue({
      id: 'doc-1',
      revision: 4,
    });
    prisma.submission.create.mockResolvedValue({
      id: 'sub-1',
      title: 'Essay',
      submittedAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    prisma.submission.count.mockResolvedValue(2);
    prisma.freeTierApplication.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: prisma.$executeRaw,
        user: prisma.user,
        submission: prisma.submission,
        freeTierApplication: prisma.freeTierApplication,
        document: prisma.document,
        documentWriteJournal: prisma.documentWriteJournal,
        submissionActivity: prisma.submissionActivity,
      };

      return callback(tx);
    });
  });

  test('keeps legacy owner submission working while Revision Flow is off', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      data: {
        success: boolean;
      };
    };

    expect(response.data.success).toBe(true);
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    const activity = prisma.submissionActivity.create.mock.calls[0][0].data;
    expect(activity).toEqual(
      expect.objectContaining({
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'profile-1',
        eventType: 'submission.created',
        occurredAfterRelease: false,
      })
    );
    expect(JSON.stringify(activity.metadata)).not.toContain('Draft');
  });

  for (const actor of [
    {
      name: 'same-organization non-owner student',
      membershipId: 'profile-same-org-non-owner',
      organizationId: 'org-1',
    },
    {
      name: 'cross-organization student',
      membershipId: 'profile-cross-org',
      organizationId: 'org-2',
    },
  ]) {
    test(`refuses a ${actor.name} before creating a revision submission`, async () => {
      requireMembership.mockResolvedValue({
        id: actor.membershipId,
        role: 'STUDENT',
        isOrgOwner: false,
        organization: {
          id: actor.organizationId,
          name: 'Other organization',
          revisionFlowEnabled: true,
        },
      });
      prisma.document.findFirst.mockResolvedValue(null);
      const form = new FormData();
      form.append('documentId', 'doc-1');

      const response = await action({
        request: new Request('https://example.com/api/domain/submit-document', {
          method: 'POST',
          body: form,
        }),
      } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'doc-1',
          deletedAt: null,
          OR: [
            { membershipId: actor.membershipId },
            {
              membership: {
                classesAsStudent: {
                  some: {
                    teachers: { some: { id: actor.membershipId } },
                  },
                },
              },
            },
          ],
        }),
        select: expect.any(Object),
      });
      expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.submission.create).not.toHaveBeenCalled();
    });
  }

  test('fails closed when the required submission audit write is unavailable', async () => {
    const previous = process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
    process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = 'false';
    const form = new FormData();
    form.append('documentId', 'doc-1');

    try {
      await expect(
        action({
          request: new Request(
            'https://example.com/api/domain/submit-document',
            { method: 'POST', body: form }
          ),
        } as any)
      ).rejects.toThrow(
        'Submission activity recording is temporarily unavailable'
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
      } else {
        process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = previous;
      }
    }
  });

  test('records a document submit journal entry with the full document payload', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      data: {
        success: boolean;
      };
    };

    expect(response.data.success).toBe(true);
    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.create.mock.calls[0]?.[0]).toMatchObject(
      {
        data: {
          eventType: 'document.submit',
          source: 'submit-document',
          status: 'pending',
          documentId: 'doc-1',
          title: 'Essay',
          html: '<p>Draft</p>',
          text: 'Draft',
          baseRevision: 4,
        },
      }
    );
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      {
        where: { id: 'journal-1' },
        data: {
          status: 'accepted',
          resultingRevision: 4,
        },
      }
    );
  });

  test('rolls back the protected submit when journal acceptance fails', async () => {
    prisma.documentWriteJournal.update
      .mockRejectedValueOnce(new Error('journal acceptance unavailable'))
      .mockResolvedValueOnce({ id: 'journal-1', status: 'rejected' });
    const form = new FormData();
    form.append('documentId', 'doc-1');

    await expect(
      action({
        request: new Request('https://example.com/api/domain/submit-document', {
          method: 'POST',
          body: form,
        }),
      } as any)
    ).rejects.toThrow('journal acceptance unavailable');

    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(2);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      { data: { status: 'accepted' } }
    );
    expect(prisma.documentWriteJournal.update.mock.calls[1]?.[0]).toMatchObject(
      {
        data: {
          status: 'rejected',
          failureReason: 'submit_transaction_failed',
        },
      }
    );
  });

  test('returns 409 with no submission or activity when access changes before commit', async () => {
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as { data: { success: boolean }; init?: { status?: number } };

    expect(response.init?.status).toBe(409);
    expect(prisma.submission.create).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    expect(
      prisma.documentWriteJournal.update.mock.calls.at(-1)?.[0]
    ).toMatchObject({
      data: { status: 'rejected' },
    });
  });

  test('backfills an empty document title from the submit prompt title', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: '',
      submissions: [],
      revision: 4,
      updatedAt: new Date('2026-08-20T11:59:00.000Z'),
      classAssignment: null,
      membership: {
        organizationId: 'org-1',
        organization: { plan: 'SCHOOL' },
        classesAsStudent: [
          {
            id: 'class-1',
            schoolId: 'school-1',
            school: { organizationId: 'org-1' },
            teachers: [{ id: 'teacher-1' }],
          },
        ],
      },
    });
    prisma.submission.create.mockResolvedValue({
      id: 'sub-1',
      title: 'My essay title',
      submittedAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    prisma.document.findUniqueOrThrow.mockResolvedValue({
      id: 'doc-1',
      revision: 4,
      title: 'My essay title',
    });
    const form = new FormData();
    form.append('documentId', 'doc-1');
    form.append('title', 'My essay title');

    await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(prisma.document.updateMany.mock.calls[0]?.[0].data).toMatchObject({
      title: 'My essay title',
    });
    expect(prisma.submission.create.mock.calls[0]?.[0].data.title).toBe(
      'My essay title'
    );
  });

  test('uses updatedAt as the active-submission concurrency token', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(prisma.document.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      revision: 4,
      updatedAt: new Date('2026-08-20T11:59:00.000Z'),
    });
  });

  test('records first free classroom essay with application acquisition properties', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submissions: [],
      revision: 4,
      updatedAt: new Date('2026-08-20T11:59:00.000Z'),
      classAssignment: {
        class: {
          id: 'class-1',
          schoolId: 'school-1',
          school: { organizationId: 'org-free' },
          teachers: [{ id: 'teacher-1' }],
        },
      },
      membership: {
        organizationId: 'org-free',
        organization: { plan: 'FREE_CLASSROOM' },
        classesAsStudent: [],
      },
    });
    prisma.submission.count.mockResolvedValue(1);
    prisma.freeTierApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      acquisitionTokenId: 'tok-1',
      acquisitionToken: {
        label: 'NCTE QR',
        sourceName: 'NCTE booth',
        eventLocation: 'Denver',
        eventDate: new Date('2026-10-01T00:00:00.000Z'),
        bypassWaitlist: true,
      },
    });
    const form = new FormData();
    form.append('documentId', 'doc-1');

    await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(captureFreeTierAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'free_tier.first_essay',
        distinctId: 'free-tier-organization:org-free',
        properties: expect.objectContaining({
          application_id: 'app-1',
          organization_id: 'org-free',
          submission_id: 'sub-1',
          document_id: 'doc-1',
          class_id: 'class-1',
          is_first_essay: true,
          submission_count: 1,
          acquisition_token_id: 'tok-1',
          acquisition_channel: 'event_link',
          token_label: 'NCTE QR',
          source_name: 'NCTE booth',
          event_location: 'Denver',
          event_date: '2026-10-01T00:00:00.000Z',
          bypass_waitlist: true,
        }),
      })
    );
  });
  for (const variant of [
    'organic',
    'later',
    'lookup_failure',
    'capture_failure',
    'count_failure',
    'conflict',
    'empty',
  ] as const) {
    test(`first-essay analytics boundary: ${variant}`, async () => {
      const doc = await prisma.document.findFirst();
      doc.membership.organization.plan = 'FREE_CLASSROOM';
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.submission.count.mockResolvedValue(variant === 'later' ? 2 : 1);
      if (variant === 'lookup_failure')
        prisma.freeTierApplication.findFirst.mockRejectedValue(
          new Error('offline')
        );
      if (variant === 'count_failure')
        prisma.submission.count.mockRejectedValue(new Error('optional count'));
      if (variant === 'capture_failure')
        captureFreeTierAnalyticsEvent.mockImplementation(() => {
          throw new Error('offline');
        });
      if (variant === 'conflict')
        prisma.document.updateMany.mockResolvedValue({ count: 0 });
      if (variant === 'empty') {
        doc.html = '';
        doc.text = '';
      }
      const form = new FormData();
      form.set('documentId', 'doc-1');
      const result = await action({
        request: new Request('http://localhost/api/domain/submit-document', {
          method: 'POST',
          body: form,
        }),
      } as any);
      if (variant === 'empty' || variant === 'conflict') {
        expect(prisma.submission.create).not.toHaveBeenCalled();
        expect(captureFreeTierAnalyticsEvent).not.toHaveBeenCalled();
      } else {
        expect((result as any).data.success).toBe(true);
        expect(
          prisma.documentWriteJournal.update.mock.calls.at(-1)?.[0].data.status
        ).toBe('accepted');
        if (variant === 'organic')
          expect(captureFreeTierAnalyticsEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              properties: expect.objectContaining({
                acquisition_channel: 'organic',
              }),
            })
          );
        if (
          variant === 'later' ||
          variant === 'lookup_failure' ||
          variant === 'count_failure'
        )
          expect(captureFreeTierAnalyticsEvent).not.toHaveBeenCalled();
      }
    });
  }
});
