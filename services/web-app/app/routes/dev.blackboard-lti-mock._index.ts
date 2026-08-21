import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { proxyBlackboardLtiMock } from '~/utils/blackboard-lti-mock-proxy.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return proxyBlackboardLtiMock(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return proxyBlackboardLtiMock(request);
}
