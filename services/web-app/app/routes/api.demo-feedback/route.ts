import type { ActionFunctionArgs } from 'react-router';
import { submitDemoFeedback } from '~/utils/demo-feedback.server';
import { demoFeedbackDependencies } from '~/utils/demo-feedback-runtime.server';

export const action = ({ request }: ActionFunctionArgs) => submitDemoFeedback(request, demoFeedbackDependencies);
