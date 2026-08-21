import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { proxyBlackboardLtiMock } from '~/utils/blackboard-lti-mock-proxy.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  return proxyBlackboardLtiMock(request, params['*'] || '');
}

export async function action({ request, params }: ActionFunctionArgs) {
  return proxyBlackboardLtiMock(request, params['*'] || '');
}
