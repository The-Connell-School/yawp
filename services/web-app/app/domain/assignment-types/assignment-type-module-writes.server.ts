import type { Prisma } from '@app/prisma';

type Client = Pick<
  Prisma.TransactionClient,
  'assignmentModule' | 'assignmentModuleInstruction'
>;
export type ModuleWriteInput = {
  title?: string;
  description?: string | null;
  isSelfGuided?: boolean;
  tutorInstructions?: string | null;
  tutorInstructionsVariantsJson?: Record<string, string>;
  rubricAlignmentJson?: Record<
    string,
    'primary' | 'supporting' | 'preparatory' | 'not-applicable'
  >;
};
export type StepWriteInput = {
  title?: string;
  prompt?: string;
  tutorInstructions?: string | null;
  tutorInstructionsVariantsJson?: Record<string, string>;
  showChatButton?: boolean;
  showNextButton?: boolean;
  buttons?: Array<{ label: string; action: 'advance' | 'response' }>;
};

// The legacy editor uses count-based positions. API callers supply max + 1
// so appends remain at the end even after a deletion leaves a position gap.
export async function createModule(
  client: Client,
  assignmentTypeId: string,
  input: ModuleWriteInput & { title: string },
  position?: number
) {
  return client.assignmentModule.create({
    data: {
      ...input,
      position:
        position ??
        (await client.assignmentModule.count({
          where: { assignmentTypeId, deletedAt: null },
        })),
      assignmentTypeId,
    },
  });
}
export function updateModule(
  client: Client,
  id: string,
  input: ModuleWriteInput
) {
  return client.assignmentModule.update({ where: { id }, data: input });
}
export function deleteModule(client: Client, id: string) {
  return client.assignmentModule.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
export async function reorderModules(client: Client, ids: string[]) {
  return Promise.all(
    ids.map((id, position) =>
      client.assignmentModule.update({ where: { id }, data: { position } })
    )
  );
}
function stepData(input: StepWriteInput, id?: string) {
  const { buttons, ...fields } = input;
  return {
    ...fields,
    ...(buttons !== undefined
      ? {
          buttons: {
            ...(id
              ? { deleteMany: { assignmentModuleInstructionId: id } }
              : {}),
            create: buttons.map((button, position) => ({
              ...button,
              position,
            })),
          },
        }
      : {}),
  };
}
export async function createStep(
  client: Client,
  assignmentModuleId: string,
  input: StepWriteInput & { title: string; prompt: string },
  position?: number
) {
  return client.assignmentModuleInstruction.create({
    data: {
      ...stepData(input),
      title: input.title,
      prompt: input.prompt,
      assignmentModuleId,
      position:
        position ??
        (await client.assignmentModuleInstruction.count({
          where: { assignmentModuleId },
        })),
    },
  });
}
export function updateStep(client: Client, id: string, input: StepWriteInput) {
  return client.assignmentModuleInstruction.update({
    where: { id },
    data: stepData(input, id),
  });
}
export function deleteStep(client: Client, id: string) {
  return client.assignmentModuleInstruction.delete({ where: { id } });
}
export async function reorderSteps(client: Client, ids: string[]) {
  return Promise.all(
    ids.map((id, position) =>
      client.assignmentModuleInstruction.update({
        where: { id },
        data: { position },
      })
    )
  );
}
