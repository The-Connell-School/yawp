import type { LoaderFunctionArgs } from 'react-router';
import { internalAdminOrganizationDetail } from '~/utils/internal-admin-organizations.server';

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  internalAdminOrganizationDetail(request, params.id);
