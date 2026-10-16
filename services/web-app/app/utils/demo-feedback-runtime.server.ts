import { DEMO_FEEDBACK_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { testerFeedbackDependencies } from './tester-feedback-runtime.server';
import { demoFeedbackAvailable, type DemoFeedbackDependencies } from './demo-feedback.server';

export const demoFeedbackDependencies: DemoFeedbackDependencies = {
  environment: testerFeedbackDependencies.environment,
  flagEnabled: () => isFeatureFlagEnabled(DEMO_FEEDBACK_FLAG),
  getUser: testerFeedbackDependencies.getUser,
  save: testerFeedbackDependencies.save,
};
export const isDemoFeedbackAvailable = () => demoFeedbackAvailable(demoFeedbackDependencies);
