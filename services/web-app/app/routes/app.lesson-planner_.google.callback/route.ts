/** Google's answer to the Google Docs permission ask (Oct 24 handoff, task 3). */
import type { LoaderFunctionArgs } from 'react-router';
import { finishDriveGrant } from '~/domain/lesson-planner/google-doc.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return finishDriveGrant(request);
}
