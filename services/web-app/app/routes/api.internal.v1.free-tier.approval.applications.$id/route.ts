import type { LoaderFunctionArgs } from 'react-router';
import { approvalDetail } from '~/utils/internal-free-tier-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => approvalDetail(request);

