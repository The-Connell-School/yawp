import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();

const prisma = {
  lessonPlanConversation: { findFirst: mock(), update: mock() },
  lessonPlanMessage: { updateMany: mock(), findFirst: mock() },
  lessonPlanMaterial: {
    upsert: mock(),
    deleteMany: mock(),
    updateMany: mock(),
    findUnique: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId: mock(),
  requireMembership: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function formRequest(fields: Record<string, string>) {
  return new Request('http://localhost/api/domain/lesson-planner/packet', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

const access = {
  membership: { id: 'teacher-1', organization: { id: 'org-1', name: 'Org' } },
  allowed: true,
};

beforeEach(() => {
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue(access);
  prisma.lessonPlanConversation.findFirst
    .mockReset()
    .mockResolvedValue({ id: 'plan-1' });
  prisma.lessonPlanConversation.update.mockReset().mockResolvedValue({});
  prisma.lessonPlanMessage.updateMany
    .mockReset()
    .mockResolvedValue({ count: 1 });
  prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue({
    id: 'msg-1',
    createdAt: new Date('2026-08-05T10:00:00.000Z'),
    content:
      'Here is the lesson.\n\n```yawp-material\nkind: handout\ntitle: Diagnose & Repair\n---\nRead each excerpt.\n```',
  });
  prisma.lessonPlanMaterial.upsert.mockReset().mockResolvedValue({
    id: 'material-1',
  });
  prisma.lessonPlanMaterial.deleteMany.mockReset().mockResolvedValue({
    count: 1,
  });
  prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({
    count: 1,
  });
  prisma.lessonPlanMaterial.findUnique.mockReset().mockResolvedValue(null);
});

describe('lesson packet action — one material at a time', () => {
  test('adds a yawp-exit-ticket block as a student handout', async () => {
    prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue({
      id: 'msg-exit',
      createdAt: new Date('2026-08-05T10:00:01.000Z'),
      content:
        '## Closing\n\n```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\ntopic: comma splices\nanswer: objective\nmustMention: Whether the material moves.\n```',
    });

    await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-exit',
        materialKey: 'ticket',
      }),
    } as any);

    const upsert = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      kind: 'exit-ticket',
      blockKey: 'ticket',
      slot: 'ticket',
      audience: 'student',
    });
    expect(upsert.create.content).toContain('comma splices');
  });

  test('adds a single handout out of a reply, without the plan around it', async () => {
    prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue({
      id: 'msg-1',
      createdAt: new Date('2026-08-05T10:00:00.000Z'),
      content:
        'Here is the lesson.\n\n```yawp-material\nkind: handout\ntitle: Diagnose & Repair\n---\nRead each excerpt.\n```',
    });
    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    const upsert = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      conversationId: 'plan-1',
      sourceMessageId: 'msg-1',
      blockKey: '0',
      kind: 'handout',
      title: 'Diagnose & Repair',
      audience: 'student',
    });
    expect(upsert.create.content).toContain('Read each excerpt.');
    // Ordered by the reply it came from, not by when the teacher clicked.
    expect(upsert.create.sourceCreatedAt).toEqual(
      new Date('2026-08-05T10:00:00.000Z')
    );
    // The whole reply is not kept — that is the point.
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
    expect((response.data as any).added).toBe(true);
  });

  test('adding the same material twice is the same add', async () => {
    await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    expect(prisma.lessonPlanMaterial.upsert.mock.calls[0][0].where).toEqual({
      conversationId_slot: {
        conversationId: 'plan-1',
        slot: 'handout:diagnose-repair',
      },
    });
  });

  test('a revision takes the place of the version it replaces', async () => {
    // Same slot, written in a later reply — one handout, not two.
    prisma.lessonPlanMaterial.findUnique.mockResolvedValue({
      sourceMessageId: 'msg-old',
      blockKey: '0',
    });

    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    const upsert = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(upsert.update).toMatchObject({ sourceMessageId: 'msg-1' });
    // The older card has to stop claiming to be in the packet.
    expect((response.data as any).replaced).toBe('msg-old:0');
  });

  test('takes it back out again', async () => {
    const response = await action({
      request: formRequest({
        intent: 'remove-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    expect(prisma.lessonPlanMaterial.deleteMany.mock.calls[0][0].where).toEqual(
      {
        conversationId: 'plan-1',
        sourceMessageId: 'msg-1',
        blockKey: '0',
      }
    );
    expect((response.data as any).added).toBe(false);
  });

  test('404s on a material that is not in that reply', async () => {
    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '7',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.lessonPlanMaterial.upsert).not.toHaveBeenCalled();
  });

  test('renames a saved material without touching the reply it came from', async () => {
    await action({
      request: formRequest({
        intent: 'rename-material',
        conversationId: 'plan-1',
        materialId: 'material-1',
        sectionTitle: 'Quote sandwich practice',
      }),
    } as any);

    expect(prisma.lessonPlanMaterial.updateMany.mock.calls[0][0]).toMatchObject(
      {
        where: { id: 'material-1', conversationId: 'plan-1' },
        data: { title: 'Quote sandwich practice' },
      }
    );
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('404s when the reply is not in this teacher’s lesson', async () => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue(null);

    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'not-mine',
        materialKey: '0',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.lessonPlanMaterial.upsert).not.toHaveBeenCalled();
  });
});

describe('lesson packet action', () => {
  test('keeps a reply for the packet with an audience', async () => {
    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        audience: 'student',
      }),
    } as any);

    expect(response.data).toMatchObject({ kept: true });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    // Scoped through the conversation the teacher was just proven to own.
    expect(update.where).toMatchObject({
      id: 'msg-1',
      conversationId: 'plan-1',
      role: 'assistant',
    });
    expect(update.data.keptAudience).toBe('student');
    expect(update.data.keptAt).toBeInstanceOf(Date);
  });

  test('defaults a kept section to the teacher-facing plan', async () => {
    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);

    expect(
      prisma.lessonPlanMessage.updateMany.mock.calls[0][0].data.keptAudience
    ).toBe('teacher');
  });

  test('rejects an audience it does not recognize', async () => {
    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        audience: 'parents',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('drops a section back out of the packet', async () => {
    const response = await action({
      request: formRequest({
        intent: 'drop',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);

    expect(response.data).toMatchObject({ kept: false });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    expect(update.data).toEqual({ keptAt: null, keptAudience: null });
  });

  test('renames the packet', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rename',
        conversationId: 'plan-1',
        packetTitle: '  Conclusions, period 3  ',
      }),
    } as any);

    expect(response.data).toMatchObject({
      packetTitle: 'Conclusions, period 3',
    });
    expect(
      prisma.lessonPlanConversation.update.mock.calls[0][0].data.packetTitle
    ).toBe('Conclusions, period 3');
  });

  test('clears a blank name back to the conversation title', async () => {
    await action({
      request: formRequest({
        intent: 'rename',
        conversationId: 'plan-1',
        packetTitle: '   ',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.update.mock.calls[0][0].data.packetTitle
    ).toBeNull();
  });

  test('renames a saved resource', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        sectionTitle: '  Fix-It sentences  ',
      }),
    } as any);

    expect(response.data).toMatchObject({ sectionTitle: 'Fix-It sentences' });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      id: 'msg-1',
      conversationId: 'plan-1',
      role: 'assistant',
    });
    expect(update.data).toEqual({ keptTitle: 'Fix-It sentences' });
  });

  test('clears a blank resource name back to the derived title', async () => {
    await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        sectionTitle: '   ',
      }),
    } as any);

    expect(
      prisma.lessonPlanMessage.updateMany.mock.calls[0][0].data.keptTitle
    ).toBeNull();
  });

  test('will not rename a section outside the conversation', async () => {
    prisma.lessonPlanMessage.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        messageId: 'not-in-here',
        sectionTitle: 'Anything',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('requires a message to rename a section', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        sectionTitle: 'Orphan',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('refuses a conversation that is not the teacher’s', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);

    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'someone-elses',
        messageId: 'msg-1',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('scopes the ownership check to the calling teacher', async () => {
    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'plan-1',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
  });

  test('reports when the message did not belong to the conversation', async () => {
    prisma.lessonPlanMessage.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'not-in-here',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('rejects an unknown intent', async () => {
    const response = await action({
      request: formRequest({
        intent: 'delete-everything',
        conversationId: 'plan-1',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
  });

  test('requires a mutable request before touching anything', async () => {
    requireMutableRequest.mockRejectedValue(
      new Response(null, { status: 403 })
    );

    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any).catch(() => undefined);

    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * A teacher's own words in a handout, saved directly — and what has to
 * happen the moment a later "Add to stack" click would write over them.
 */
describe('lesson packet action — editing a material by hand', () => {
  test('saves the new content and marks it edited', async () => {
    prisma.lessonPlanMaterial.updateMany.mockResolvedValue({ count: 1 });

    const response = await action({
      request: formRequest({
        intent: 'edit-material',
        conversationId: 'plan-1',
        materialId: 'material-1',
        content: 'Read each excerpt, revised by hand.',
      }),
    } as any);

    expect(prisma.lessonPlanMaterial.updateMany.mock.calls[0][0]).toMatchObject(
      {
        where: { id: 'material-1', conversationId: 'plan-1' },
        data: { content: 'Read each excerpt, revised by hand.' },
      }
    );
    expect(
      prisma.lessonPlanMaterial.updateMany.mock.calls[0][0].data.editedAt
    ).toBeInstanceOf(Date);
    expect((response.data as any).edited).toBe(true);
  });

  test('refuses to edit a material from another lesson', async () => {
    prisma.lessonPlanMaterial.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: formRequest({
        intent: 'edit-material',
        conversationId: 'plan-1',
        materialId: 'someone-elses-material',
        content: 'Rewritten.',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('requires content', async () => {
    const response = await action({
      request: formRequest({
        intent: 'edit-material',
        conversationId: 'plan-1',
        materialId: 'material-1',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
  });
});

describe('lesson packet action — filing a revision over a hand-edited material', () => {
  test('refuses to file a different version without asking first', async () => {
    prisma.lessonPlanMaterial.findUnique.mockResolvedValue({
      sourceMessageId: 'msg-old',
      blockKey: '0',
      editedAt: new Date('2026-08-18T09:00:00.000Z'),
    });

    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    expect(response.init?.status).toBe(409);
    expect((response.data as any).conflict).toBe(true);
    expect(prisma.lessonPlanMaterial.upsert).not.toHaveBeenCalled();
  });

  test('files the revision once the teacher confirms, and clears the fork', async () => {
    prisma.lessonPlanMaterial.findUnique.mockResolvedValue({
      sourceMessageId: 'msg-old',
      blockKey: '0',
      editedAt: new Date('2026-08-18T09:00:00.000Z'),
    });

    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
        confirmReplace: '1',
      }),
    } as any);

    const upsert = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(upsert.update).toMatchObject({
      sourceMessageId: 'msg-1',
      editedAt: null,
    });
    expect((response.data as any).replaced).toBe('msg-old:0');
  });

  /**
   * Re-filing the exact material the edit was made on is not a new version —
   * it has nowhere else to have come from — so it must not be treated as a
   * conflict even though the slot's `editedAt` is still set.
   */
  test('does not treat re-filing the same source as a conflict', async () => {
    prisma.lessonPlanMaterial.findUnique.mockResolvedValue({
      sourceMessageId: 'msg-1',
      blockKey: '0',
      editedAt: new Date('2026-08-18T09:00:00.000Z'),
    });

    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    expect(response.init?.status).toBeUndefined();
    expect(prisma.lessonPlanMaterial.upsert).toHaveBeenCalled();
  });

  test('an unedited slot replaces normally, same as before', async () => {
    prisma.lessonPlanMaterial.findUnique.mockResolvedValue({
      sourceMessageId: 'msg-old',
      blockKey: '0',
      editedAt: null,
    });

    const response = await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);

    expect(response.init?.status).toBeUndefined();
    expect((response.data as any).replaced).toBe('msg-old:0');
  });
});
