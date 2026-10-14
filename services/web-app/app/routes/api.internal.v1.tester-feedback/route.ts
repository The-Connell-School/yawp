import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { readTesterFeedback } from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';
import { preserveTesterFeedbackRequest, testerFeedbackRequestContext } from '~/utils/tester-feedback-request.server';

export const middleware = [preserveTesterFeedbackRequest];

export const loader = ({ context }: LoaderFunctionArgs<RouterContextProvider>) =>
  readTesterFeedback(context.get(testerFeedbackRequestContext), testerFeedbackDependencies, 'internal');
