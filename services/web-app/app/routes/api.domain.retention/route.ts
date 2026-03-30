import { type ActionFunctionArgs, data as dataResponse } from 'react-router';

function assertInternalToken(request: Request) {
  const token =
    new URL(request.url).searchParams.get('token') ||
    request.headers.get('x-internal-token');
  if (!token || token !== process.env.INTERNAL_COMMAND_TOKEN) {
    return false;
  }
  return true;
}

export async function loader({ request }: ActionFunctionArgs) {
  if (!assertInternalToken(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // DocumentRevisions are permanent — no cleanup needed.
  // DocumentWriteJournal entries are lightweight and kept for audit.
  // Old DocumentVersion/DocumentSnapshot cleanup removed as those tables
  // are being phased out in favor of DocumentRevision.

  return dataResponse({
    message: 'No retention actions needed',
  });
}

export const action = loader;
