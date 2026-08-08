import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { requireMutableRequest } from '~/utils/auth.server';
import {
  buildModuleRubricGuidance,
  buildTutorSystemPrompt,
} from './build-system-prompt';
import { parseRubric } from '~/domain/assignment-types/assignment-type-rubric.shared';
import { normalizeModuleRubricAlignment } from '~/domain/assignment-types/assignment-type-rubric-config';
import {
  buildAiContextAuditMetadata,
  buildAiTextContextAudit,
} from '~/utils/ai-context-audit.server';
import { firstNameFromFullName } from '~/domain/grading/personalize';
import { buildRedactionMapping, redact, rehydrate } from '~/utils/ai-redaction';

const LLM_FAILED = 'Failed to get a response from the tutor. Please try again.';

const POST = z.object({
  response: z.string().min(1),
  cmsId: z.string().min(1),
  content: z.string().optional(),
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
  await requireMutableRequest(request);

  try {
    const { error, data } = await parseFormData(request, POST);
    if (error) return validationError(error);

    const cms = await prisma.assignmentModuleSession.findUnique({
      where: { id: data.cmsId },
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
            membership: { select: { user: { select: { name: true } } } },
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

    const system = buildTutorSystemPrompt({
      tutorInstructions: cms.assignmentModule.tutorInstructions,
      instructionTutorInstructions: instruction.tutorInstructions,
      moduleRubricGuidance,
    });

    // The student's real first name never leaves our servers: every prompt
    // sent to the AI provider below uses `redact()`'d text, and the
    // model's reply is `rehydrate()`'d back to the real name before it is
    // persisted or returned. In-memory only for the life of this request -
    // see app/utils/ai-redaction for the shared primitives (same pattern
    // used by grading and Reporter).
    const studentFirstName = firstNameFromFullName(
      cms.document.membership?.user?.name
    );
    const nameMapping = buildRedactionMapping([studentFirstName]);

    const documentSource =
      data.content === undefined ? 'db-document-text' : 'client-content';
    const documentText = data.content ?? cms.document.text ?? '';
    // Audit metadata (length/hash) is computed off the real text on purpose
    // - it's metadata-only and never leaves the server as prompt content,
    // and it needs to match what's actually stored so the audit trail is
    // trustworthy. Only the text handed to the model gets redacted.
    const documentContext = buildAiTextContextAudit({
      documentSource,
      documentId: cms.document.id,
      text: documentText,
    });
    // Students write about themselves by name and often sign their work,
    // so the document body carries the real name just as surely as a name
    // field would. Prose mode so a student named Will doesn't get every
    // "will" in their writing mangled - see common-word-names.server.ts.
    const redactedDocumentText = redact(documentText, nameMapping, {
      mode: 'prose',
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

    // Prior turns are persisted with the real name (that's what the
    // student's UI replays on reload) and the student's own new message
    // routinely contains their own name too ("Amelia here, ..."). Redact
    // both before they go into the prompt, same prose-mode reasoning as
    // the document body above.
    const currentMessages = cms.messages.map((m) => ({
      role: m.agent as AgentType,
      content: redact(m.content, nameMapping, { mode: 'prose' }),
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
            documentText: redactedDocumentText,
            source: documentSource,
            sha256: documentContext.documentTextSha256,
          }),
        },
        {
          role: AgentType.User,
          content: redact(data.response, nameMapping, { mode: 'prose' }),
        },
      ]);

    let completion: string;
    try {
      completion = await getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        messages,
        system,
        maxTokens: 500,
        // Tutor prompts carry raw student document text; never let an
        // Anthropic outage silently route it to OpenAI, and never persist
        // the cleartext payload to LlmLog. With cross-provider fallback
        // disabled there is no other provider to retry onto, so an
        // Anthropic outage is just a failure.
        allowFallbackProvider: false,
        logPayload: 'metadata-only',
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
      return errorResponse(error as any);
    }
    // The model read redacted text, so any excerpt quoting the student's
    // name comes back carrying the pseudonym - restore it before this
    // touches the database or the caller.
    completion = rehydrate(completion, nameMapping);

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
