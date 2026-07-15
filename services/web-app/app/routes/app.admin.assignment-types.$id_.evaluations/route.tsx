import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';

// The evaluations UI moved to /prompt. Keep this route as a redirect so
// existing bookmarks and links to the old URL still work.
export async function loader({ params }: LoaderFunctionArgs) {
  throw redirect(`/app/admin/assignment-types/${params.id}/prompt`);
}
