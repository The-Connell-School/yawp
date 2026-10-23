import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { readTesterFeedbackScreenshot } from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';
import {
  preserveTesterFeedbackRequest,
  testerFeedbackRequestContext,
} from '~/utils/tester-feedback-request.server';

export const middleware = [preserveTesterFeedbackRequest];

export const loader = ({
  context,
  params,
}: LoaderFunctionArgs<RouterContextProvider>) =>
  readTesterFeedbackScreenshot(
    context.get(testerFeedbackRequestContext),
    params.id ?? '',
    testerFeedbackDependencies
  );
