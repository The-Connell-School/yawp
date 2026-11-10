import type { ActionFunctionArgs } from 'react-router';
import { organizationFeatureFlagUpdate } from '~/utils/internal-organization-feature-flags-http.server';

export const action = ({ request, params }: ActionFunctionArgs) =>
  organizationFeatureFlagUpdate(request, params.orgId, params.key);
