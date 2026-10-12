import type { ActionFunctionArgs } from 'react-router';
import { tokensPatch } from '~/utils/internal-free-tier-http.server';

export const action = ({ request, params }: ActionFunctionArgs) =>
  tokensPatch(request, params.id ?? '');
