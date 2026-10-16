import type { ActionFunctionArgs } from 'react-router';
import { submitTesterFeedback } from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';

export const action = ({ request }: ActionFunctionArgs) =>
  submitTesterFeedback(request, testerFeedbackDependencies);
