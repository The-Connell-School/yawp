import type { LoaderFunctionArgs } from 'react-router';
import { readTesterFeedback } from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';

// Resource route: CSV must bypass document rendering on the review page.
export const loader = ({ request }: LoaderFunctionArgs) =>
  readTesterFeedback(request, testerFeedbackDependencies, 'admin');
