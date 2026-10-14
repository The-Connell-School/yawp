import type { Route } from './+types/route';
import type { RouterContextProvider } from 'react-router';
import { readTesterFeedback } from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';
import { preserveTesterFeedbackRequest, testerFeedbackRequestContext } from '~/utils/tester-feedback-request.server';

export const middleware = [preserveTesterFeedbackRequest];

export const loader = ({ context }: Route.LoaderArgs) =>
  readTesterFeedback((context as RouterContextProvider).get(testerFeedbackRequestContext), testerFeedbackDependencies, 'internal');
