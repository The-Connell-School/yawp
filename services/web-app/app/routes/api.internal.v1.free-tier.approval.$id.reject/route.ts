import type { ActionFunctionArgs } from 'react-router';
import { rejectHttp } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => rejectHttp(request);

