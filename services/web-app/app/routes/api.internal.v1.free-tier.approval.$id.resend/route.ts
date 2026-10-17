import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { approvalResendHttp } from '~/utils/internal-approval-resend.server';
export const action = ({ request, params }: ActionFunctionArgs) => approvalResendHttp(request, params.id);
export const loader = ({ request, params }: LoaderFunctionArgs) => approvalResendHttp(request, params.id);
