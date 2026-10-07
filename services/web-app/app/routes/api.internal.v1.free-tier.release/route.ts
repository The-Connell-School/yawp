import type { ActionFunctionArgs } from 'react-router';
import { releaseBatchHttp } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => releaseBatchHttp(request);

