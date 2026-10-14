import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  internalAdminOrganizationDetail,
  internalAdminOrganizationUpdate,
} from '~/utils/internal-admin-organizations.server';

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  internalAdminOrganizationDetail(request, params.id);

export const action = ({ request, params }: ActionFunctionArgs) =>
  internalAdminOrganizationUpdate(request, params.id);
