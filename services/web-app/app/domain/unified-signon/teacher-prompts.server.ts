import { data } from 'react-router';
import { prisma } from '~/utils/db.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { SIGNON_TEACHER_PROMPTS_FLAG } from '~/domain/feature-flags/feature-flags';
import { teacherPromptAccount } from './teacher-prompts';
import { createFlow, flowCookie, saveNewFlow, stateFor } from './flow.server';

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
  if (
    screen === 'inactive' &&
    (await prisma.orgMembership.count({ where: { userId, isActive: true } }))
  )
    return null;
  const flow = await createFlow(request, '/app');
  flow.data.userId = userId;
  flow.data.identifier = account.identifier;
  const initialState = stateFor(flow, {
    screen,
    identifier: account.identifier,
    variant: 'student',
  }).state;
  await saveNewFlow(flow);
  return data(
    {
      teacherPromptEntry: {
        redirectTo: '/app',
        googleAvailable: false,
        initialState,
        teacherPromptAccount: account,
      },
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'set-cookie': await flowCookie.serialize({
          browser: flow.browser,
          token: flow.token,
        }),
      },
    }
  );
}
