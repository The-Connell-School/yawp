import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { internalQa } from '~/utils/internal-qa-runtime.server';
export const loader = ({ request }: LoaderFunctionArgs) => internalQa.list(request);
export const action = ({ request }: ActionFunctionArgs) => internalQa.create(request);
