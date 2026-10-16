import type { LoaderFunctionArgs } from 'react-router';
import { usageSummaryHttp } from '~/utils/internal-free-tier-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => usageSummaryHttp(request);
