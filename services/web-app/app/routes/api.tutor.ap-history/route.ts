import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { buildApHistorySystemPrompt } from './build-system-prompt';

const LLM_FAILED =
  'Failed to get a response from the tutor. Please try again.';

const PostSchema = z.object({
  mode: z.enum(['reply', 'scan']),
  documentId: z.string().min(1),
  message: z.string().optional(),
  phase: z.string().optional(),
  essayType: z.enum(['dbq', 'leq']),
});

const READ_DOCUMENT_TOOL = {
  name: 'read_student_document',
  description:
    "Returns the student's current document draft. Call this whenever you need to review, reference, or give feedback on the student's writing.",
  input_schema: { type: 'object' as const, properties: {} },
};

const SCAN_PROMPT = `Scan the student's draft for failure-mode flags. Call read_student_document first. Then return a JSON object with a single key "flags" containing an array of objects, each with "id" (one of the detector IDs from your instructions) and "detail" (one sentence explaining the issue). Return at most 2 flags. If the draft is clean, return {"flags":[]}.`;

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return dataResponse(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { mode, documentId, message, phase, essayType } = parsed.data;

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        text: true,
        assignmentType: {
          select: {
            essayType: true,
            period: true,
            sourceDocuments: {
              select: {
                title: true,
                attribution: true,
                body: true,
                position: true,
              },
              orderBy: { position: 'asc' },
            },
          },
        },
        assignment: {
          select: {
            prompt: true,
            coachingScope: true,
          },
        },
      },
    });

    if (!doc) {
      return dataResponse({ error: 'Document not found' }, { status: 404 });
    }

    const sources = doc.assignmentType?.sourceDocuments.map((s, i) => ({
      label: String.fromCharCode(65 + i),
      title: s.title,
      attribution: s.attribution,
      body: s.body,
    }));

    const periodEntries = doc.assignmentType?.period
      ? await prisma.contextBankEntry.findMany({
          where: { period: doc.assignmentType.period },
          select: {
            name: true,
            category: true,
            summary: true,
            dateOrRange: true,
          },
          orderBy: { periodNumber: 'asc' },
        })
      : [];

    const periodContext = periodEntries.map(
      (e) => `${e.name} (${e.category}, ${e.dateOrRange}): ${e.summary}`
    );

    const systemPrompt = buildApHistorySystemPrompt({
      essayType,
      phase: phase ?? 'drafting',
      prompt: doc.assignment?.prompt ?? '',
      sources,
      periodContext,
    });

    let tutorSession = await prisma.tutorSession.findFirst({
      where: { documentId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 50 },
      },
    });

    if (!tutorSession) {
      tutorSession = await prisma.tutorSession.create({
        data: {
          documentId,
          essayType,
          currentPhase: phase ?? 'source-analysis',
          coachingScope: doc.assignment?.coachingScope ?? 'full',
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' }, take: 50 },
        },
      });
    }

    if (phase && phase !== tutorSession.currentPhase) {
      await prisma.tutorSession.update({
        where: { id: tutorSession.id },
        data: { currentPhase: phase },
      });
    }

    const documentText = doc.text ?? '';

    if (mode === 'scan') {
      const scanMessages: { role: AgentType; content: string }[] = [
        { role: AgentType.User, content: SCAN_PROMPT },
      ];

      let scanResult: string;
      try {
        scanResult = await getLLMCompletion({
          model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
          messages: scanMessages,
          system: systemPrompt,
          maxTokens: 300,
          temperature: 0,
          tools: [READ_DOCUMENT_TOOL],
          handleToolCall: async (name) => {
            if (name === 'read_student_document') return documentText;
            return '';
          },
          metadata: {
            caller: 'api.tutor.ap-history',
            mode: 'scan',
            documentId,
          },
        });
      } catch (error) {
        return dataResponse(
          { error: LLM_FAILED, detail: (error as Error).message },
          { status: 500 }
        );
      }

      let flags: { id: string; detail: string }[] = [];
      try {
        const parsed = JSON.parse(scanResult);
        if (Array.isArray(parsed.flags)) flags = parsed.flags.slice(0, 2);
      } catch {
        flags = [];
      }

      const firedSet = new Set(
        (tutorSession.detectorsFired as string[]) ?? []
      );
      const newFlags = flags.filter((f) => !firedSet.has(f.id));

      if (newFlags.length > 0) {
        for (const f of newFlags) firedSet.add(f.id);
        await prisma.tutorSession.update({
          where: { id: tutorSession.id },
          data: { detectorsFired: Array.from(firedSet) },
        });
      }

      return dataResponse({ flags: newFlags });
    }

    const history = tutorSession.messages.map((m) => ({
      role: m.role as AgentType,
      content: m.content,
    }));

    const messages: { role: AgentType; content: string }[] = [
      ...history,
      { role: AgentType.User, content: message ?? '' },
    ];

    let reply: string;
    try {
      reply = await getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        messages,
        system: systemPrompt,
        maxTokens: 500,
        tools: [READ_DOCUMENT_TOOL],
        handleToolCall: async (name) => {
          if (name === 'read_student_document') return documentText;
          return '';
        },
        metadata: {
          caller: 'api.tutor.ap-history',
          mode: 'reply',
          documentId,
          phase,
        },
      });
    } catch (error) {
      return dataResponse(
        { error: LLM_FAILED, detail: (error as Error).message },
        { status: 500 }
      );
    }

    await prisma.tutorMessage.createMany({
      data: [
        {
          tutorSessionId: tutorSession.id,
          role: 'student',
          content: message ?? '',
          phase,
        },
        {
          tutorSessionId: tutorSession.id,
          role: 'tutor',
          content: reply,
          phase,
        },
      ],
    });

    return dataResponse({ reply, phase: tutorSession.currentPhase });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('AP History tutor error:', error);
    return dataResponse({ error: 'An error occurred.' }, { status: 500 });
  }
}
