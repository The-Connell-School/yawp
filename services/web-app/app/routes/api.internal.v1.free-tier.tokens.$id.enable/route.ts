import type { ActionFunctionArgs } from 'react-router';
import { tokensEnable } from '~/utils/internal-free-tier-http.server';

export const action = ({ request, params }: ActionFunctionArgs) =>
  tokensEnable(request, params.id ?? '');
