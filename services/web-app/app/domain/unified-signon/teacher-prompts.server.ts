import { data } from 'react-router';
import { prisma } from '~/utils/db.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { SIGNON_TEACHER_PROMPTS_FLAG } from '~/domain/feature-flags/feature-flags';
import { teacherPromptAccount } from './teacher-prompts';

export async function loadTeacherPromptAccount(userId: string) {
  if (!(await isFeatureFlagEnabled(SIGNON_TEACHER_PROMPTS_FLAG)))
    return undefined;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      memberships: { select: { role: true } },
    },
  });
  return teacherPromptAccount({
    ...user,
    roles: user.memberships.map((m) => m.role),
  });
}

/** Give the existing enrollment transport a session-bound, server-owned flow. */
export async function signedInTeacherPromptEntry(
  request: Request,
  userId: string,
  screen: 'inactive' | 'class-code'
) {
  const account = await loadTeacherPromptAccount(userId);
  if (!account || account.kind === 'staff') return null;
  const {
    browserContext,
    createFlow,
    FlowError,
    flowCookie,
    saveNewFlow,
    stateFor,
    withFlow,
  } = await import('./flow.server');
  const entry = (initialState: import('./contracts').SignonState) => ({
    teacherPromptEntry: {
      redirectTo: '/app',
      googleAvailable: false,
      initialState,
      teacherPromptAccount: account,
    },
  });
  const context = await browserContext(request);
  if (context) {
    try {
      const initialState = await withFlow(
        request,
        context.token,
        async (flow, tx) => {
          if (!flow.data.teacherPromptEntry || flow.data.userId !== userId)
            return undefined;
          if (flow.data.state.screen === 'joined') {
            const { classConfirmationState } =
              await import('./class-confirmation.server');
            return (await classConfirmationState(tx, flow)).state;
          }
          return flow.data.state;
        }
      );
      // Resume before the inactive guard: successful enrollment has made the
      // account active, but its confirmation must remain usable on reload.
      if (initialState)
        return data(entry(initialState), {
          headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
      if (!(error instanceof FlowError)) throw error;
      // Expired, consumed, or invalid browser flows need a fresh entry.
    }
  }
  if (
    screen === 'inactive' &&
    (await prisma.orgMembership.count({ where: { userId, isActive: true } }))
  )
    return null;
  const flow = await createFlow(request, '/app');
  flow.data.teacherPromptEntry = true;
  flow.data.userId = userId;
  flow.data.identifier = account.identifier;
  const initialState = stateFor(flow, {
    screen,
    identifier: account.identifier,
    variant: 'student',
  }).state;
  await saveNewFlow(flow);
  return data(entry(initialState), {
    headers: {
      'Cache-Control': 'private, no-store',
      'set-cookie': await flowCookie.serialize({
        browser: flow.browser,
        token: flow.token,
      }),
    },
  });
}
