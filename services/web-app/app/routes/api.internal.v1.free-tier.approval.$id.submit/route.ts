import type { ActionFunctionArgs } from 'react-router';
import { submitAdminInfoHttp } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => submitAdminInfoHttp(request);

