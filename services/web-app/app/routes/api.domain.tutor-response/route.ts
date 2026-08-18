import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { isLlmFallbackRetrySignal } from '~/utils/getLLMCompletion/llm-provider-errors.server';
import {
  requireMembership,
  requireMutableRequest,
  requireUserId,
} from '~/utils/auth.server';
import {
  documentAuthorOwnSessionWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';
import {
  buildModuleRubricGuidance,
  buildTutorSystemPromptBlocks,
} from './build-system-prompt';
import { parseRubric } from '~/domain/assignment-types/assignment-type-rubric.shared';
import { normalizeModuleRubricAlignment } from '~/domain/assignment-types/assignment-type-rubric-config';
import {
  buildAiContextAuditMetadata,
  buildAiTextContextAudit,
} from '~/utils/ai-context-audit.server';

const LLM_FAILED = 'Failed to get a response from the tutor. Please try again.';

const POST = z.object({
  response: z.string().min(1),
  cmsId: z.string().min(1),
  content: z.string().optional(),
  llmRetry: z.enum(['fallback']).optional(),
});

const errorResponse = (error: { message: string }) => {
  return dataResponse(
    { error: LLM_FAILED + 'Error: ' + error.message },
    { status: 500 }
  );
};

function buildDocumentContextMessage({
  documentText,
  source,
  sha256,
}: {
  documentText: string;
  source: 'client-content' | 'db-document-text';
  sha256: string;
}) {
  return [
    `<student_document_context source="${source}" text_length="${documentText.length}" sha256="${sha256}">`,
    documentText,
    '</student_document_context>',
  ].join('\n');
}

export async function action({ request }: ActionFunctionArgs) {
  // Kept ahead of requireUserId so a read-only impersonation session still gets its
  // explicit 403 rather than a login redirect.
  await requireMutableRequest(request);

  // Deliberately outside the try/catch below: requireUserId throws a redirect Response
  // when there is no session, and the catch-all would otherwise turn that into a 500.
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  try {
    const { error, data } = await parseFormData(request, POST);
    if (error) return validationError(error);

    // Scoped to the caller's OWN session, not merely authenticated: driving the
    // tutor bills a completion and writes two messages (one carrying the document
    // text) into the session, so only the student whose transcript it is may reach
    // it. On a shared draft that is the group member it belongs to rather than the
    // document's nominal owner. A revoked account no longer matches.
    const cms = await prisma.assignmentModuleSession.findFirst({
      where: {
        id: data.cmsId,
        ...documentAuthorOwnSessionWhere({ profileId: profile.id, isAdmin }),
      },
      include: {
        assignmentModule: {
          include: {
            instructions: { orderBy: { position: 'asc' } },
            assignmentType: {
              select: {
                id: true,
                gradingAssistantVersion: true,
                rubricJson: true,
              },
            },
          },
        },
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        document: {
          select: {
            id: true,
            text: true,
            assignment: { select: { tutorEnabled: true } },
          },
        },
      },
    });

    if (!cms) {
      return dataResponse(
        { error: 'No course module session found' },
        { status: 404 }
      );
    }

    if (cms.document?.assignment?.tutorEnabled === false) {
      return dataResponse(
        { error: 'The tutor is turned off for this assignment.' },
        { status: 403 }
      );
    }

    const instruction =
      cms.assignmentModule.instructions[cms.instructionsCompleted];
    if (!instruction) {
      return dataResponse(
        { error: 'No current instruction found.' },
        { status: 404 }
      );
    }

    const moduleRubric = parseRubric(
      cms.assignmentModule.assignmentType?.rubricJson
    );
    const moduleRubricGuidance = buildModuleRubricGuidance({
      categories: moduleRubric.categories,
      alignment: cms.assignmentModule.rubricAlignmentJson,
    });

    const system = buildTutorSystemPromptBlocks({
      tutorInstructions: cms.assignmentModule.tutorInstructions,
      instructionTutorInstructions: instruction.tutorInstructions,
      moduleRubricGuidance,
    });

    const documentSource =
      data.content === undefined ? 'db-document-text' : 'client-content';
    const documentText = data.content ?? cms.document.text ?? '';
    const documentContext = buildAiTextContextAudit({
      documentSource,
      documentId: cms.document.id,
      text: documentText,
    });
    const moduleRubricRelationships = normalizeModuleRubricAlignment(
      cms.assignmentModule.rubricAlignmentJson,
      moduleRubric.categories
    );
    const aiContextMetadata = buildAiContextAuditMetadata({
      textContext: documentContext,
      assignmentTypeId: cms.assignmentModule.assignmentType?.id ?? null,
      assignmentTypeRubricSource:
        moduleRubric.categories.length > 0 ? 'assignment-type' : 'missing',
      assignmentTypeGradingVersion:
        cms.assignmentModule.assignmentType?.gradingAssistantVersion ?? null,
      rubricCategoryKeys: moduleRubric.categories.map((category) => category.key),
    });

    const currentMessages = cms.messages.map((m) => ({
      role: m.agent as AgentType,
      content: m.content,
      name: m.agent,
    }));

    const messages: { role: AgentType; content: string; name?: string }[] = [
      {
        role: AgentType.User,
        content: `
				Get started! Begin your message by introducing me.
				Pretend I am a person you are talking to.
				Address me like you are talking first, and then I will respond.`,
      },
    ]
      .concat(currentMessages)
      .concat([
        {
          role: AgentType.User,
          content: buildDocumentContextMessage({
            documentText,
            source: documentSource,
            sha256: documentContext.documentTextSha256,
          }),
        },
        {
          role: AgentType.User,
          content: data.response,
        },
      ]);

    let completion: string;
    const forceFallback = data.llmRetry === 'fallback';
    try {
      completion = await getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        messages,
        system,
        maxTokens: 500,
        forceFallback,
        signalFallbackRetry: !forceFallback,
        metadata: {
          feature: 'tutor',
          kind: 'assignment-module-tutor',
          cmsId: cms.id,
          assignmentModuleId: cms.assignmentModuleId,
          instructionId: instruction.id,
          ...aiContextMetadata,
          moduleRubricRelationships,
        },
      });
    } catch (error) {
      if (isLlmFallbackRetrySignal(error)) {
        return dataResponse({ retrying: true }, { status: 202 });
      }
      return errorResponse(error as any);
    }

    await prisma.assignmentModuleSession.update({
      where: { id: cms.id },
      data: {
        updatedAt: new Date(),
        messages: {
          create: [
            {
              agent: AgentType.User,
              content: data.response,
              context: documentText,
              instructionId: instruction.id,
            },
            {
              agent: AgentType.Assistant,
              content: completion,
              instructionId: instruction.id,
            },
          ],
        },
      },
    });

    const updatedCms = await prisma.assignmentModuleSession.findUnique({
      where: { id: cms.id },
      include: {
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        assignmentModule: {
          include: {
            instructions: {
              orderBy: { position: 'asc' },
              include: { buttons: { orderBy: { position: 'asc' } } },
            },
            assignmentType: {
              select: {
                assignmentModules: {
                  select: { id: true, position: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    return dataResponse({ cms: updatedCms });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return dataResponse({ error: 'An error occurred.' }, { status: 500 });
  }
}
