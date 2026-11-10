import {
  isDemoDeployment,
  isPreviewDeployment,
} from '~/domain/feature-flags/feature-flags.deployment';
import { isDevPanelRuntimeEnabled } from '~/dev-panel/dev-panel-runtime.server';
import { testerFeedbackDependencies } from './tester-feedback-runtime.server';
import {
  demoFeedbackAvailable,
  type DemoFeedbackDependencies,
} from './demo-feedback.server';

export const demoFeedbackDependencies: DemoFeedbackDependencies = {
  environment: testerFeedbackDependencies.environment,
  flagEnabled: async () =>
    isDemoDeployment(process.env) ||
    isPreviewDeployment(process.env) ||
    isDevPanelRuntimeEnabled(),
  getUser: testerFeedbackDependencies.getUser,
  save: testerFeedbackDependencies.save,
};
export const isDemoFeedbackAvailable = () =>
  demoFeedbackAvailable(demoFeedbackDependencies);
