import type { ActionFunctionArgs } from 'react-router';
import { tokensCreate } from '~/utils/internal-free-tier-http.server';

export const action = ({ request }: ActionFunctionArgs) => tokensCreate(request);

