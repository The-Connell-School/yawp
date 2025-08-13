import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { getBase64Audio } from '~/services/openai.js';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';

const LLM_FAILED = 'Failed to get a response from the tutor. Please try again.';

const POST = z.object({
  response: z.string().min(1),
  cmsId: z.string().min(1),
  speechSpeed: z.string().optional(),
  speechEnabled: z.union([z.literal('true'), z.literal('false')]),
});

const errorResponse = (error: { message: string }) => {
  return dataResponse(
    { error: LLM_FAILED + 'Error: ' + error.message },
    { status: 500 }
  );
};

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { error, data } = await parseFormData(request, POST);
    if (error) return validationError(error);

    const cms = await prisma.studentCourseModuleSession.findUnique({
      where: {
        id: data.cmsId,
      },
      include: {
        studentCourseModule: {
          include: {
            instructions: { orderBy: { position: 'asc' } },
          },
        },
        messages: true,
        document: { select: { text: true } },
      },
    });

    if (!cms) {
      return dataResponse(
        { error: 'No course module session found' },
        { status: 404 }
      );
    }

    const instruction =
      cms.studentCourseModule.instructions[cms.instructionsCompleted];
    if (!instruction) {
      return dataResponse(
        { error: 'No current instruction found.' },
        { status: 404 }
      );
    }

    const system = `
		${cms.studentCourseModule.tutorInstructions}
		${instruction.tutorInstructions}`;

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
          content: `content = '${cms.document.text}', response = '${data.response}'`,
        },
      ]);

    let completion: string;
    try {
      completion = await getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-3-5-sonnet-20240620',
        messages,
        system,
        maxTokens: 500,
      });
    } catch (error) {
      return errorResponse(error as any);
    }

    await prisma.studentCourseModuleSession.update({
      where: { id: cms.id },
      data: {
        messages: {
          create: [
            {
              agent: AgentType.User,
              content: data.response,
              context: cms.document.text,
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

    return dataResponse({
      audio:
        data.speechEnabled === 'true'
          ? await getBase64Audio(completion, data.speechSpeed)
          : '',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return dataResponse({ error: 'An error occurred.' }, { status: 500 });
  }
}
