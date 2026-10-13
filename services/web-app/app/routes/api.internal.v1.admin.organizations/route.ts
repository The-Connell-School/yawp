import type { LoaderFunctionArgs } from 'react-router';
import { internalAdminOrganizationsList } from '~/utils/internal-admin-organizations.server';

export const loader = ({ request }: LoaderFunctionArgs) =>
  internalAdminOrganizationsList(request);
