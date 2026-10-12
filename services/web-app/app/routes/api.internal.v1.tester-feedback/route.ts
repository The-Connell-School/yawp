import type { LoaderFunctionArgs } from 'react-router';
import { readTesterFeedback } from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';

export const loader = ({ request }: LoaderFunctionArgs) => readTesterFeedback(request, testerFeedbackDependencies, 'internal');
