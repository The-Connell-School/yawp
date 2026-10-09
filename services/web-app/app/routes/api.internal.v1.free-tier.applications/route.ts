import type { LoaderFunctionArgs } from 'react-router';
import { applicationsSearch } from '~/utils/internal-free-tier-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => applicationsSearch(request);

