import type { LoaderFunctionArgs } from 'react-router';
import { exportCsv } from '~/utils/internal-free-tier-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => exportCsv(request);

