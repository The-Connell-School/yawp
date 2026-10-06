import type { ActionFunctionArgs } from 'react-router';
import { approveHttp } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => approveHttp(request);

