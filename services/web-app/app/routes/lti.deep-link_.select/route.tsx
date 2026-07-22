import type { LoaderFunctionArgs } from 'react-router';
import { Form, redirect, useLoaderData } from 'react-router';
import {
  destroyLtiDeepLinkCookie,
  getLtiDeepLinkCookie,
} from '~/cookies/lti-deep-link.server';
import { inspectLtiDeepLinkRequest } from '~/domain/lms/lti-pilot.server';
import { getUserId } from '~/utils/auth.server';

async function requireSelectionContext(request: Request) {
  const cookie = await getLtiDeepLinkCookie(request);
  const userId = await getUserId(request);
  if (!cookie || !userId) throw redirect('/lti/error');
  return { cookie, userId };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const context = await requireSelectionContext(request);
  try {
    return await inspectLtiDeepLinkRequest({
      requestId: context.cookie.id,
      browserSecret: context.cookie.secret,
      teacherUserId: context.userId,
    });
  } catch {
    throw redirect('/lti/error', {
      headers: { 'set-cookie': await destroyLtiDeepLinkCookie() },
    });
  }
}

export default function DeepLinkSelection() {
  const data = useLoaderData<typeof loader>();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Place a Yawp assignment</h1>
      <p className="mt-2 text-slate-600">
        Choose one assignment from {data.className}.
      </p>
      {data.assignments.length === 0 ? (
        <p className="mt-8 rounded-lg border p-5">
          Create an assignment in Yawp before returning to the LMS.
        </p>
      ) : (
        <Form
          method="post"
          action="/lti/deep-link/select/complete"
          reloadDocument
          className="mt-8 space-y-4"
        >
          <fieldset className="space-y-3">
            <legend className="sr-only">Yawp assignment</legend>
            {data.assignments.map((assignment, index) => (
              <label
                key={assignment.id}
                className="block rounded-lg border p-4 focus-within:ring-2"
              >
                <input
                  type="radio"
                  name="classAssignmentId"
                  value={assignment.id}
                  defaultChecked={index === 0}
                  className="mr-3"
                />
                <span className="font-medium">{assignment.title}</span>
                <span className="ml-2 text-sm text-slate-600">
                  {assignment.pointValue} points
                </span>
                <span className="mt-2 block text-sm text-slate-600">
                  {assignment.prompt}
                </span>
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-5 py-3 font-medium text-white"
          >
            Add to LMS
          </button>
        </Form>
      )}
    </main>
  );
}
