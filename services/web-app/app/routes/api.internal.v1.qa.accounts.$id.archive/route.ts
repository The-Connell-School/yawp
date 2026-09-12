import type { ActionFunctionArgs } from 'react-router';
import { internalQa } from '~/utils/internal-qa-runtime.server';
export const action = ({ request, params }: ActionFunctionArgs) => internalQa.archive(request, params.id);
