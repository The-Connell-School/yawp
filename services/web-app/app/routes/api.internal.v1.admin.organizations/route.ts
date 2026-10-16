import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  internalAdminOrganizationCreate,
  internalAdminOrganizationsList,
} from '~/utils/internal-admin-organizations.server';

export const loader = ({ request }: LoaderFunctionArgs) =>
  internalAdminOrganizationsList(request);

export const action = ({ request }: ActionFunctionArgs) =>
  internalAdminOrganizationCreate(request);
