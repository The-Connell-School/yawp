import type { ActionFunctionArgs } from 'react-router';
import { internalOrganizationSearch } from '~/utils/internal-directory.server';
export const action = ({ request }: ActionFunctionArgs) => internalOrganizationSearch(request);
