import type { ActionFunctionArgs } from 'react-router';
import { markManualReviewHttp } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => markManualReviewHttp(request);

