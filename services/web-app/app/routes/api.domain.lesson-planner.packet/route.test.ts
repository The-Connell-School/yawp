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
    findFirst: mock(),
    findMany: mock(),
  },
  lessonPlanAssignmentLink: { upsert: mock() },
  $transaction: mock(),
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
const writeStackOrder = mock();
const moveStackEntry = mock();
const nextPositionFor = mock();
const loadStackOrder = mock();
mock.module('~/domain/lesson-planner/stack-order.server', () => ({
  writeStackOrder,
  moveStackEntry,
  nextPositionFor,
  loadStackOrder,
}));

const loadLessonPacket = mock();
mock.module('~/domain/lesson-planner/load-lesson-packet.server', () => ({ loadLessonPacket }));
const fileReplyPieces = mock();
mock.module('~/domain/lesson-planner/file-reply-pieces.server', () => ({
  fileReplyPieces,
}));

const getLessonPlannerReviewFlags = mock();
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));

const { action, loader } = await import('./route');

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
  getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ teachNotes: false });
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
  prisma.lessonPlanMaterial.findFirst.mockReset().mockResolvedValue(null);
  writeStackOrder.mockReset().mockResolvedValue({ ok: true, order: [] });
  moveStackEntry.mockReset().mockResolvedValue({ ok: true, order: [] });
  nextPositionFor.mockReset().mockResolvedValue(null);
  loadStackOrder.mockReset().mockResolvedValue([]);
  fileReplyPieces.mockReset().mockResolvedValue({ added: [], skipped: [] });
  prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([]);
  prisma.$transaction
    .mockReset()
    .mockImplementation(async (callback: (client: typeof prisma) => unknown) =>
      callback(prisma)
    );
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
    // Its place in the stack goes with it: kept again, it lands at the end.
    expect(update.data).toEqual({ keptAt: null, keptAudience: null, position: null });
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
 * happen the moment a later "Add to lesson" click would write over them.
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

  // Brian's run 2 (items 23, 24, 27): typing into the stack's "Edit" box on a
  // slide deck and saving wrote the text over the deck's slides, so the deck
  // vanished and "hhhh" became the card. A deck is edited in the deck editor;
  // a text edit must never reach it.
  test('never writes text over a slide deck', async () => {
    prisma.lessonPlanMaterial.updateMany.mockResolvedValue({ count: 0 });
    prisma.lessonPlanMaterial.findFirst.mockResolvedValue({
      id: 'deck-1',
      kind: 'slides',
    });

    const response = await action({
      request: formRequest({
        intent: 'edit-material',
        conversationId: 'plan-1',
        materialId: 'deck-1',
        content: 'hhhh',
      }),
    } as any);

    const where = prisma.lessonPlanMaterial.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'deck-1', conversationId: 'plan-1' });
    expect(where.NOT).toEqual({ kind: 'slides' });
    expect(response.init?.status).toBe(400);
    expect((response.data as any).error).toBe('deck-not-editable-as-text');
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

describe("lesson packet action — removing from the stack screen (Brian's review, B2)", () => {
  test('deletes one filed piece by its own id, inside this lesson only', async () => {
    const response = await action({
      request: formRequest({
        intent: 'delete-material',
        conversationId: 'plan-1',
        materialId: 'material-9',
      }),
    } as any);

    expect(prisma.lessonPlanMaterial.deleteMany.mock.calls[0][0].where).toEqual({
      id: 'material-9',
      conversationId: 'plan-1',
    });
    expect((response.data as any).removed).toBe(true);
  });

  test('404s when the piece is not in this lesson', async () => {
    prisma.lessonPlanMaterial.deleteMany.mockResolvedValue({ count: 0 });
    const response = await action({
      request: formRequest({
        intent: 'delete-material',
        conversationId: 'plan-1',
        materialId: 'someone-elses',
      }),
    } as any);
    expect(response.init?.status).toBe(404);
  });

  test('requires the material id', async () => {
    const response = await action({
      request: formRequest({ intent: 'delete-material', conversationId: 'plan-1' }),
    } as any);
    expect(prisma.lessonPlanMaterial.deleteMany).not.toHaveBeenCalled();
    expect(response).toBeDefined();
  });
});

describe("lesson packet action — the teacher's order (Brian's run 2, A1)", () => {
  test('reorder writes the order it was given, for this lesson', async () => {
    writeStackOrder.mockResolvedValue({ ok: true, order: ['m:b', 'r:a'] });
    const response = await action({
      request: formRequest({
        intent: 'reorder',
        conversationId: 'plan-1',
        order: 'm:b,r:a',
      }),
    } as any);
    expect(writeStackOrder).toHaveBeenCalledWith('plan-1', ['m:b', 'r:a']);
    expect((response.data as any).order).toEqual(['m:b', 'r:a']);
  });

  test('reorder refuses a piece from another lesson', async () => {
    writeStackOrder.mockResolvedValue({ ok: false });
    const response = await action({
      request: formRequest({ intent: 'reorder', conversationId: 'plan-1', order: 'm:x' }),
    } as any);
    expect(response.init?.status).toBe(404);
  });

  test('reorder needs an order', async () => {
    const response = await action({
      request: formRequest({ intent: 'reorder', conversationId: 'plan-1' }),
    } as any);
    expect(response.init?.status).toBe(422);
  });

  test('move takes one piece one step', async () => {
    moveStackEntry.mockResolvedValue({ ok: true, order: ['m:b', 'm:a'] });
    const response = await action({
      request: formRequest({
        intent: 'move',
        conversationId: 'plan-1',
        entry: 'm:b',
        direction: 'up',
      }),
    } as any);
    expect(moveStackEntry).toHaveBeenCalledWith('plan-1', 'm:b', 'up');
    expect((response.data as any).order).toEqual(['m:b', 'm:a']);
  });

  test('a piece filed into a reordered stack goes to the end', async () => {
    nextPositionFor.mockResolvedValue(4);
    await action({
      request: formRequest({
        intent: 'add-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);
    const upsert = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(upsert.create.position).toBe(4);
    // A revision keeps the place of what it replaces.
    expect(upsert.update.position).toBeUndefined();
  });

  test('a reply kept into a reordered stack goes to the end', async () => {
    nextPositionFor.mockResolvedValue(2);
    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);
    expect(prisma.lessonPlanMessage.updateMany.mock.calls[0][0].data.position).toBe(2);
  });
});

describe("lesson packet action — use this class starter instead (Brian's run 2, E1)", () => {
  const SWAP_REPLY =
    'Two others:\n\n```yawp-daily-pages\nkind: class-starter\nid: FW-093\nWhat is the heaviest thing you have carried?\n```\n\n' +
    '```yawp-daily-pages\nkind: class-starter\nid: FW-024\nWhat do you carry that no one sees?\n```';

  beforeEach(() => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue({
      id: 'msg-swap',
      createdAt: new Date('2026-10-12T10:05:00Z'),
      content: SWAP_REPLY,
    });
    prisma.lessonPlanMaterial.findMany.mockResolvedValue([
      { id: 'old-starter', sourceMessageId: 'msg-1', blockKey: 'dp', editedAt: null },
    ]);
    prisma.lessonPlanMaterial.upsert.mockResolvedValue({ id: 'new-starter' });
    loadStackOrder.mockResolvedValue(['m:framing', 'm:old-starter', 'm:ticket']);
  });

  test('takes the old starter out and puts this one in its place', async () => {
    const response = await action({
      request: formRequest({
        intent: 'replace-material',
        conversationId: 'plan-1',
        messageId: 'msg-swap',
        materialKey: 'dp:1',
      }),
    } as any);

    expect(prisma.lessonPlanMaterial.findMany.mock.calls[0][0].where).toEqual({
      conversationId: 'plan-1',
      kind: 'class-starter',
    });
    expect(prisma.lessonPlanMaterial.deleteMany.mock.calls[0][0].where).toEqual({
      conversationId: 'plan-1',
      id: { in: ['old-starter'] },
    });
    const upsert = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(upsert.create.content).toBe('What do you carry that no one sees?');
    expect(upsert.create.promptId).toBe('FW-024');
    expect(writeStackOrder).toHaveBeenCalledWith('plan-1', ['m:framing', 'm:new-starter', 'm:ticket']);
    expect((response as any).data).toMatchObject({
      added: true,
      messageId: 'msg-swap',
      materialKey: 'dp:1',
      replacedTokens: ['msg-1:dp'],
    });
  });

  test('asks first when the old starter was edited by hand', async () => {
    prisma.lessonPlanMaterial.findMany.mockResolvedValue([
      { id: 'old-starter', sourceMessageId: 'msg-1', blockKey: 'dp', editedAt: new Date() },
    ]);
    const response = await action({
      request: formRequest({
        intent: 'replace-material',
        conversationId: 'plan-1',
        messageId: 'msg-swap',
        materialKey: 'dp',
      }),
    } as any);
    expect((response as any).init?.status).toBe(409);
    expect(prisma.lessonPlanMaterial.deleteMany).not.toHaveBeenCalled();
  });

  test('with no starter in the stack, it is simply added', async () => {
    prisma.lessonPlanMaterial.findMany.mockResolvedValue([]);
    const response = await action({
      request: formRequest({
        intent: 'replace-material',
        conversationId: 'plan-1',
        messageId: 'msg-swap',
        materialKey: 'dp',
      }),
    } as any);
    expect(prisma.lessonPlanMaterial.upsert).toHaveBeenCalled();
    expect(writeStackOrder).not.toHaveBeenCalled();
    expect((response as any).data.replacedTokens).toEqual([]);
  });

  test('refuses something that is not a class starter or Daily Pages prompt', async () => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue({
      id: 'msg-1',
      createdAt: new Date(),
      content: '```yawp-material\nkind: handout\ntitle: H\n---\nRead.\n```',
    });
    const response = await action({
      request: formRequest({
        intent: 'replace-material',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        materialKey: '0',
      }),
    } as any);
    expect((response as any).init?.status).toBe(400);
  });
});

describe("lesson packet action — everything, as pieces (Brian's run 2, A4, E3)", () => {
  test('keep-all files every piece of the reply on its own', async () => {
    fileReplyPieces.mockResolvedValue({ added: ['msg-1:st', 'msg-1:0'], skipped: [] });
    const response = await action({
      request: formRequest({ intent: 'keep-all', conversationId: 'plan-1', messageId: 'msg-1' }),
    } as any);
    expect(fileReplyPieces.mock.calls[0][0]).toMatchObject({
      conversationId: 'plan-1',
      message: { id: 'msg-1' },
      replaceKeptReply: false,
      confirmReplace: false,
    });
    expect((response as any).data).toEqual({
      added: ['msg-1:st', 'msg-1:0'],
      skipped: [],
      messageId: 'msg-1',
    });
    // Nothing is kept whole.
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('split-kept turns a whole kept reply into its pieces, in its place', async () => {
    await action({
      request: formRequest({ intent: 'split-kept', conversationId: 'plan-1', messageId: 'msg-1' }),
    } as any);
    expect(fileReplyPieces.mock.calls[0][0].replaceKeptReply).toBe(true);
  });

  test('404s on a reply from another lesson', async () => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue(null);
    const response = await action({
      request: formRequest({ intent: 'keep-all', conversationId: 'plan-1', messageId: 'nope' }),
    } as any);
    expect((response as any).init?.status).toBe(404);
  });
});

describe("lesson packet loader — the stack beside the chat (Brian's run 2, A7)", () => {
  const loaded = (stackPanel: boolean) => ({
    conversationId: 'plan-1',
    packet: {
      sections: [
        { id: 'm1', origin: 'material', title: 'Read aloud (20 min)', kind: 'plan', anchor: 'resource-m1' },
      ],
      outline: [{ anchor: 'resource-m1', minutes: 20 }],
    },
    stackDetails: { m1: { label: 'Lesson step', create: null } },
    materialTokens: { m1: 'msg-1:st' },
    reviewFlags: { stackV2: true, stackPanel },
  });

  test('lists the stack in order, for the panel', async () => {
    loadLessonPacket.mockResolvedValue(loaded(true));
    const response = await loader({
      request: new Request('http://localhost/api/domain/lesson-planner/packet?conversationId=plan-1'),
    } as any);
    expect(loadLessonPacket.mock.calls[0][0].conversationId).toBe('plan-1');
    expect((response as any).items).toEqual([
      expect.objectContaining({ key: 'm:m1', title: 'Read aloud (20 min)', label: 'Lesson step', token: 'msg-1:st', minutes: 20 }),
    ]);
  });

  test('404 when the panel is off for this school', async () => {
    loadLessonPacket.mockResolvedValue(loaded(false));
    await expect(
      loader({
        request: new Request('http://localhost/api/domain/lesson-planner/packet?conversationId=plan-1'),
      } as any)
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("lesson packet — one segment, one status (Brian's run 3, items 1, 2)", () => {
  test('keep-all with materialKeys files only those pieces', async () => {
    fileReplyPieces.mockReset().mockResolvedValue({ added: ['msg-1:0', 'msg-1:1'], skipped: [] });
    await action({
      request: formRequest({ intent: 'keep-all', conversationId: 'plan-1', messageId: 'msg-1', materialKeys: '0,1' }),
    } as any);
    expect(fileReplyPieces.mock.calls[0][0].onlyKeys).toEqual(['0', '1']);
  });

  test('remove-material with materialKeys takes the whole segment out', async () => {
    prisma.lessonPlanMaterial.deleteMany.mockReset().mockResolvedValue({ count: 2 });
    const response = await action({
      request: formRequest({ intent: 'remove-material', conversationId: 'plan-1', messageId: 'msg-1', materialKeys: '0,1' }),
    } as any);
    expect(prisma.lessonPlanMaterial.deleteMany.mock.calls[0][0].where).toMatchObject({
      conversationId: 'plan-1',
      sourceMessageId: 'msg-1',
      blockKey: { in: ['0', '1'] },
    });
    expect((response as any).data).toMatchObject({ added: false, messageId: 'msg-1' });
  });

  test('the chat can ask which pieces are in the stack, with stack v2 on and no panel', async () => {
    loadLessonPacket.mockReset().mockResolvedValue({
      conversationId: 'plan-1',
      packet: { sections: [], outline: [] },
      stackDetails: {},
      materialTokens: { m1: 'msg-1:st', m2: 'msg-1:0' },
      reviewFlags: { stackV2: true, stackPanel: false },
    });
    const response = await loader({
      request: new Request('http://localhost/api/domain/lesson-planner/packet?conversationId=plan-1&view=tokens'),
    } as any);
    expect((response as any).tokens).toEqual(['msg-1:st', 'msg-1:0']);
    expect(loadLessonPacket.mock.calls[0][0].withStackDetails).toBe(false);
  });
});

describe("lesson packet — created in Yawp! (Brian's run 3, item 4)", () => {
  test('mark-created from the stack: one record for the piece, and the piece marked', async () => {
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.lessonPlanMaterial.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'mat-9', sourceMessageId: 'msg-1', blockKey: 'ticket' });
    prisma.lessonPlanAssignmentLink.upsert.mockReset().mockResolvedValue({});
    const response = await action({
      request: formRequest({
        intent: 'mark-created',
        conversationId: 'plan-1',
        materialId: 'mat-9',
        yawpHref: '/app/assignment-types/cs-type',
      }),
    } as any);
    const link = prisma.lessonPlanAssignmentLink.upsert.mock.calls[0][0];
    expect(link.where).toEqual({
      conversationId_sourceMessageId_blockKey: { conversationId: 'plan-1', sourceMessageId: 'msg-1', blockKey: 'ticket' },
    });
    expect(link.create).toMatchObject({ yawpHref: '/app/assignment-types/cs-type', createdFrom: 'stack' });
    const call = prisma.lessonPlanMaterial.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ conversationId: 'plan-1', sourceMessageId: 'msg-1', blockKey: 'ticket' });
    expect(call.data.yawpHref).toBe('/app/assignment-types/cs-type');
    expect(call.data.yawpCreatedAt).toBeInstanceOf(Date);
    expect((response as any).data).toEqual({ created: true, materialId: 'mat-9', addedToLesson: false, backToLesson: false });
  });

  test("mark-created from the chat, before the piece is filed (Oct 24 handoff, task 1)", async () => {
    prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue({ id: 'msg-1' });
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 0 });
    prisma.lessonPlanAssignmentLink.upsert.mockReset().mockResolvedValue({});
    const response = await action({
      request: formRequest({
        intent: 'mark-created',
        conversationId: 'plan-1',
        piece: 'b:msg-1:ticket',
        yawpHref: '/app/assignment-types/et-type',
      }),
    } as any);
    expect(prisma.lessonPlanAssignmentLink.upsert.mock.calls[0][0].create).toMatchObject({
      sourceMessageId: 'msg-1',
      blockKey: 'ticket',
      createdFrom: 'chat',
    });
    expect((response as any).data).toEqual({ created: true, materialId: null, addedToLesson: false, backToLesson: false });
  });

  test("Kevin's note 6a: a piece made from the chat is added to the lesson too", async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ teachNotes: true });
    prisma.lessonPlanMessage.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'msg-1', createdAt: new Date('2026-10-25T10:00:00Z'), content: 'reply' });
    // Not in the lesson yet; filed, it is.
    prisma.lessonPlanMaterial.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValue({ id: 'mat-2' });
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.lessonPlanAssignmentLink.upsert.mockReset().mockResolvedValue({});
    fileReplyPieces.mockReset().mockResolvedValue({ added: ['msg-1:ticket'], skipped: [] });
    const response = await action({
      request: formRequest({
        intent: 'mark-created',
        conversationId: 'plan-1',
        piece: 'b:msg-1:ticket',
        yawpHref: '/app/assignment-types/et-type',
      }),
    } as any);
    expect(fileReplyPieces).toHaveBeenCalledTimes(1);
    expect(fileReplyPieces.mock.calls[0][0]).toMatchObject({ conversationId: 'plan-1', onlyKeys: ['ticket'] });
    expect(fileReplyPieces.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.lessonPlanAssignmentLink.upsert.mock.invocationCallOrder[0]
    );
    expect((response as any).data).toMatchObject({ created: true, materialId: 'mat-2', addedToLesson: true, backToLesson: true });
  });

  test('a piece made from the chat that is already in the lesson is not filed again', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ teachNotes: true });
    prisma.lessonPlanMessage.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'msg-1', createdAt: new Date('2026-10-25T10:00:00Z'), content: 'reply' });
    prisma.lessonPlanMaterial.findFirst.mockReset().mockResolvedValue({ id: 'mat-2' });
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.lessonPlanAssignmentLink.upsert.mockReset().mockResolvedValue({});
    fileReplyPieces.mockReset();
    const response = await action({
      request: formRequest({
        intent: 'mark-created',
        conversationId: 'plan-1',
        piece: 'b:msg-1:ticket',
        yawpHref: '/app/assignment-types/et-type',
      }),
    } as any);
    expect(fileReplyPieces).not.toHaveBeenCalled();
    expect((response as any).data).toMatchObject({ created: true, addedToLesson: false, backToLesson: true });
  });

  test('a piece from another lesson is refused', async () => {
    prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue(null);
    prisma.lessonPlanAssignmentLink.upsert.mockReset();
    const response = await action({
      request: formRequest({
        intent: 'mark-created',
        conversationId: 'plan-1',
        piece: 'b:not-mine:ticket',
        yawpHref: '/app/assignment-types/et-type',
      }),
    } as any);
    expect((response as any).init?.status).toBe(404);
    expect(prisma.lessonPlanAssignmentLink.upsert).not.toHaveBeenCalled();
  });

  test('only a link into Yawp! assignment types is kept', async () => {
    const response = await action({
      request: formRequest({
        intent: 'mark-created',
        conversationId: 'plan-1',
        materialId: 'mat-9',
        yawpHref: 'https://evil.example/app/assignment-types/x',
      }),
    } as any);
    expect((response as any).init?.status ?? (response as any).status).toBe(422);
  });
});
