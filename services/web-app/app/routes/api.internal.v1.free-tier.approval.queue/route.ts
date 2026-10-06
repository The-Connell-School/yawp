import type { LoaderFunctionArgs } from 'react-router';
import { approvalQueue } from '~/utils/internal-free-tier-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => approvalQueue(request);

