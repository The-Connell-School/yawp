import type { ActionFunctionArgs } from 'react-router';
import { submitDevPanelFeedback } from '~/dev-panel/dev-panel-feedback.server';

export const action = ({ request }: ActionFunctionArgs) =>
  submitDevPanelFeedback(request);
