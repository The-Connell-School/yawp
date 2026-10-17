import type { ActionFunctionArgs } from 'react-router';
import { tokensDisable } from '~/utils/internal-free-tier-http.server';

export const action = ({ request, params }: ActionFunctionArgs) =>
  tokensDisable(request, params.id ?? '');
