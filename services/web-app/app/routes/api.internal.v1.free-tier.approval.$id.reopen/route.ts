import type { ActionFunctionArgs } from 'react-router';
import { reopenHttp } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => reopenHttp(request);

