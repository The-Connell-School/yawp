/**
 * Google Docs (Oct 24 handoff, task 3): ?doc=plan or ?doc=handouts. Opens
 * the lesson plan or the handouts as a Google Doc in the teacher's Drive;
 * the first time, Google asks for permission once. When it cannot, it says
 * why and offers the Word file, which Google Docs opens too.
 */
import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { openGoogleDoc, type GoogleDocProblem } from '~/domain/lesson-planner/google-doc.server';

export const meta: MetaFunction = () => [{ title: 'Google Docs · Yawp!' }];

const MESSAGES: Record<GoogleDocProblem, string> = {
  unconfigured: 'Google Docs isn’t connected on this site yet. Download the Word file instead: Google Docs opens it too.',
  declined: 'Google didn’t give Yawp! permission to make the doc. Try again, or download the Word file.',
  failed: 'Google didn’t take the file this time. Try again, or download the Word file.',
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('doc') === 'handouts' ? 'handouts' : 'plan';
  const conversationId = params.conversationId!;
  const asked = url.searchParams.get('problem');
  const word = kind === 'handouts' ? `/app/lesson-planner/${conversationId}/handouts.docx` : `/app/lesson-planner/${conversationId}/plan.docx`;
  // Back from a declined ask: say so, rather than asking again at once.
  if (asked === 'declined' || asked === 'failed') {
    return { problem: asked as GoogleDocProblem, kind, conversationId, word, retry: `${url.pathname}?doc=${kind}` };
  }
  const { problem } = await openGoogleDoc({ request, conversationId, kind });
  return { problem, kind, conversationId, word, retry: `${url.pathname}?doc=${kind}` };
}

export default function GoogleDocRoute() {
  const { problem, kind, conversationId, word, retry } = useLoaderData<typeof loader>();
  return (
    <main data-testid="google-doc-problem" className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">{kind === 'handouts' ? 'Student handouts' : 'Lesson plan'} in Google Docs</h1>
      <p data-testid="google-doc-message" className="mt-4 text-[#45403A]">
        {MESSAGES[problem]}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href={word} data-testid="google-doc-word" className="rounded-xl bg-[#1C1A17] px-5 py-3 font-semibold text-white">
          Download Word
        </a>
        {problem === 'unconfigured' ? null : (
          <a href={retry} className="rounded-xl border border-[#1C1A17]/20 px-5 py-3 font-semibold">
            Try again
          </a>
        )}
        <Link to={`/app/lesson-planner/${conversationId}/packet`} className="rounded-xl border border-[#1C1A17]/20 px-5 py-3 font-semibold">
          Back to the stack
        </Link>
      </div>
    </main>
  );
}
