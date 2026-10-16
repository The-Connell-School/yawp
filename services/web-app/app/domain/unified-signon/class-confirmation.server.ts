import type { Prisma } from '@app/prisma';
import { classSummary, selectedClass } from './classes.server';
import { FlowError, stateFor, type Flow } from './flow.server';

/** Call only after a successful enrollment/registration, using membership state
 * read before joining. Consuming the enrollment input prevents repeat joining. */
export function rememberClassConfirmation(
  flow: Flow,
  klass: { id: string; code: string },
  membershipId: string,
  already: boolean,
  generatedHandle?: string
) {
  flow.data.classConfirmation = {
    classId: klass.id,
    classCode: klass.code,
    membershipId,
    already,
    ...(generatedHandle
      ? { generatedHandle, issueSessionOnContinue: true }
      : {}),
  };
  flow.data.classId = undefined;
  flow.data.classCode = undefined;
  flow.data.classCandidates = undefined;
  flow.data.joinToken = undefined;
}

/** A receipt retains display/continuation context, not permanent access. Read
 * the current class and active enrollment again on reload and explicit use. */
export async function readClassConfirmation(
  tx: Prisma.TransactionClient,
  flow: Flow
) {
  const confirmation = flow.data.classConfirmation;
  if (!confirmation || !flow.data.userId) throw new FlowError();
  const klass = await selectedClass(tx, {
    ...flow,
    data: {
      ...flow.data,
      classId: confirmation.classId,
      classCode: confirmation.classCode,
    },
  });
  if (
    !klass ||
    !(await tx.orgMembership.findFirst({
      where: {
        id: confirmation.membershipId,
        userId: flow.data.userId,
        organizationId: klass.school.organizationId,
        role: 'STUDENT',
        isActive: true,
        isOrgOwner: false,
        classesAsStudent: { some: { id: klass.id } },
      },
      select: { id: true },
    }))
  )
    throw new FlowError(
      'This class is no longer available. Please sign in again.'
    );
  return { klass, confirmation };
}

export async function classConfirmationState(
  tx: Prisma.TransactionClient,
  flow: Flow
) {
  const { klass, confirmation } = await readClassConfirmation(tx, flow);
  return stateFor(flow, {
    screen: 'joined',
    variant: confirmation.already ? 'already' : undefined,
    classInfo: classSummary(klass),
    ...(confirmation.generatedHandle
      ? { identifier: '@' + confirmation.generatedHandle }
      : {}),
  });
}
