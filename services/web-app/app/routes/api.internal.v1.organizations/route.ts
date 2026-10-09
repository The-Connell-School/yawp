import type { LoaderFunctionArgs } from 'react-router';
import { internalOrganizationList } from '~/utils/internal-directory.server';
export const loader = ({ request }: LoaderFunctionArgs) => internalOrganizationList(request);
