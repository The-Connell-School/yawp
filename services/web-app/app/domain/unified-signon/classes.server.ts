import type { Prisma } from '@app/prisma';
import { formatClassGradePeriod } from '~/utils/class-display';
import { assertFreeClassSeatAvailableInTx } from '~/domain/free-tier/class-seat-cap.server';
import { FlowError, stateFor, type Flow } from './flow.server';
import type { SignonClass } from './contracts';

const select = {
  id: true,
  code: true,
  title: true,
  grade: true,
  period: true,
  studentJoinToken: true,
  school: {
    select: {
      name: true,
      organizationId: true,
      organization: { select: { plan: true } },
    },
  },
  teachers: { select: { user: { select: { name: true } } } },
} satisfies Prisma.ClassSelect;
export async function lookupClasses(
  tx: Prisma.TransactionClient,
  code: string
) {
  return tx.class.findMany({
    where: {
      isArchived: false,
      code: { equals: code.trim(), mode: 'insensitive' },
    },
    select,
    orderBy: { id: 'asc' },
    take: 20,
  });
}
type Klass = Awaited<ReturnType<typeof lookupClasses>>[number];
export function classSummary(klass: Klass): SignonClass {
  return {
    id: klass.id,
    name: klass.title || formatClassGradePeriod(klass) || 'Your class',
    teacher: klass.teachers[0]?.user.name || 'Your teacher',
    organization: klass.school.name,
    accountMode:
      klass.school.organization.plan === 'FREE_CLASSROOM' ? 'handle' : 'email',
  };
}
export async function selectedClass(tx: Prisma.TransactionClient, flow: Flow) {
  if (!flow.data.classId) return null;
  return tx.class.findFirst({
    where: {
      id: flow.data.classId,
      isArchived: false,
      code: { equals: flow.data.classCode, mode: 'insensitive' },
    },
    select,
  });
}
export async function chooseClass(
  tx: Prisma.TransactionClient,
  flow: Flow,
  classId: string
) {
  if (flow.data.invitationId && flow.data.proof) {
    const { readInvitation } = await import('./invitations.server');
    const invitation = await readInvitation(tx, flow);
    const selected = invitation?.classes?.find((k) => k.id === classId);
    if (!selected) throw new FlowError('Class not found.');
    flow.data.classCode = selected.code;
  }
  if (!flow.data.classCandidates?.includes(classId) || !flow.data.classCode)
    throw new FlowError('Class not found.');
  const klass = (await lookupClasses(tx, flow.data.classCode)).find(
    (k) => k.id === classId
  );
  if (!klass) throw new FlowError('Class not found.');
  flow.data.classId = klass.id;
  flow.data.joinToken = klass.studentJoinToken ?? undefined;
  const seat = await assertFreeClassSeatAvailableInTx(tx, {
    classId: klass.id,
    organizationId: klass.school.organizationId,
  });
  const info = classSummary(klass);
  if (!seat.ok)
    return stateFor(flow, {
      screen: 'class-found',
      classInfo: info,
      variant: 'full',
    });
  // Verified legacy invitations keep their existing email enrollment path.
  if (
    flow.data.invitationId &&
    flow.data.identifier &&
    info.accountMode === 'email'
  )
    return stateFor(flow, {
      screen: flow.data.proof ? 'name-password' : 'activation',
      identifier: flow.data.identifier,
      classInfo: info,
      variant: flow.data.proof === 'google' ? 'google' : undefined,
    });
  return stateFor(flow, {
    screen: 'class-found',
    classInfo: info,
    identifier: flow.data.identifier,
  });
}
export async function resolveClasses(
  tx: Prisma.TransactionClient,
  flow: Flow,
  code: string
) {
  const classes = await lookupClasses(tx, code);
  if (!classes.length)
    throw new FlowError(
      "We couldn't find a class with that code. Check it with your teacher.",
      400,
      undefined,
      {
        classCode:
          "We couldn't find a class with that code. Check it with your teacher.",
      }
    );
  flow.data.classCode = code.trim();
  flow.data.classCandidates = classes.map((k) => k.id);
  if (classes.length === 1) return chooseClass(tx, flow, classes[0].id);
  return stateFor(flow, {
    screen: 'class-found',
    variant: 'multiple',
    identifier: flow.data.identifier,
    classes: classes.map(classSummary),
  });
}
