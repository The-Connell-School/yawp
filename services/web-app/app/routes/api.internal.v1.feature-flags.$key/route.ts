import type { ActionFunctionArgs } from 'react-router';
import { featureFlagUpdate } from '~/utils/internal-feature-flags-http.server';

export const action = ({ request, params }: ActionFunctionArgs) =>
  featureFlagUpdate(request, params.key);
