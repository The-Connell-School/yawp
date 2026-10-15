import { safeRedirect } from 'remix-utils/safe-redirect';
import { requireAnonymous } from '~/utils/auth.server';
import { isUnifiedSignOnEnabled } from './gate.server';
import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { loginAction } from '~/routes/auth.login/login.server';
import type { SignonState } from './contracts';

export async function unifiedEntry(request: Request) {
  let authenticated = false;
  try {
    await requireAnonymous(request);
  } catch (response) {
    if (
      !(response instanceof Response) ||
      response.status !== 302 ||
      response.headers.get('Location') !== '/' ||
      !(await isUnifiedSignOnEnabled())
    )
      throw response;
    authenticated = true;
  }
  if (!(await isUnifiedSignOnEnabled())) return null;
  const { browserContext, withFlow } = await import('./flow.server');
  const { googleAvailable } = await import('./google.server');
  const context = await browserContext(request);
  let initialState: SignonState | undefined;
  let destination = safeRedirect(
    new URL(request.url).searchParams.get('redirectTo'),
    '/app'
  );
  if (
    context &&
    (authenticated || new URL(request.url).searchParams.has('continue'))
  ) {
    try {
      const result = await withFlow(
        request,
        context.token,
        async (flow, tx) => {
          destination = flow.data.destination;
          if (!authenticated) return flow.data.state;
          const { getUserId } = await import('~/utils/auth.server');
          const userId = await getUserId(request);
          if (!userId || userId !== flow.data.userId) throw redirect('/app');
          if (flow.data.pendingGoogle && flow.data.proof)
            return {
              screen: 'link-google' as const,
              identifier: flow.data.identifier,
              flowToken: flow.token,
            };
          const { finishAuthentication } =
            await import('./authentication.server');
          return finishAuthentication(tx, flow, request, userId, false);
        }
      );
      if (result instanceof Response) {
        if (result.headers.has('Location')) throw result;
        initialState = (await result.json()).state;
      } else initialState = result;
    } catch (error) {
      if (error instanceof Response) throw error;
      if (authenticated) throw redirect('/app');
    }
  } else if (authenticated) throw redirect('/app');
  return {
    unified: true as const,
    redirectTo: destination,
    googleAvailable: googleAvailable(),
    ...(initialState ? { initialState } : {}),
  };
}

export async function dispatchUnifiedLogin(args: ActionFunctionArgs) {
  if (!(await isUnifiedSignOnEnabled())) return loginAction(args);
  let form: FormData;
  try {
    form = await args.request.clone().formData();
  } catch {
    return Response.json({ error: 'Invalid form.' }, { status: 400 });
  }
  if (
    !form.has('intent') ||
    (form.get('intent') === 'password' && !form.get('flowToken'))
  )
    return loginAction(args);
  const { FlowError, withFlow, assertCurrentIdentity } =
    await import('./flow.server');
  try {
    const origin = args.request.headers.get('Origin');
    if (origin && origin !== new URL(args.request.url).origin)
      throw new FlowError('Invalid request origin.', 403);
    const { requireMutableRequest } = await import('~/utils/auth.server');
    await requireMutableRequest(args.request);
    if (form.get('intent') === 'password') {
      await requireAnonymous(args.request);
      return await withFlow(
        args.request,
        String(form.get('flowToken') || ''),
        async (flow, tx) => {
          await assertCurrentIdentity(tx, flow);
          if (!flow.data.identifier) throw new FlowError();
          form.set('email', flow.data.identifier.replace(/^@/, ''));
          form.set('redirectTo', '/auth/login?continue=1');
          const headers = new Headers(args.request.headers);
          headers.delete('Content-Type');
          headers.delete('Content-Length');
          const request = new Request(args.request, { body: form, headers });
          const response = await loginAction(
            { ...args, request },
            { client: tx }
          );
          if (response instanceof Response && response.status === 302) {
            flow.data.proof = 'password';
          }
          return response;
        }
      );
    }
    const { unifiedAction } = await import('./backend.server');
    const values = Object.fromEntries(
      [...form].filter(
        (pair): pair is [string, string] => typeof pair[1] === 'string'
      )
    );
    return await unifiedAction(args.request, values);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof FlowError)
      return Response.json(
        {
          error: error.fieldErrors ? '' : error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
          ...(error.retryAfterSeconds
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'private, no-store',
            ...(error.retryAfterSeconds
              ? { 'Retry-After': String(error.retryAfterSeconds) }
              : {}),
          },
        }
      );
    return Response.json(
      { error: 'Sign-in is unavailable. Please try again later.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
