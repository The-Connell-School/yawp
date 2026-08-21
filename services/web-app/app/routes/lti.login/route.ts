import { redirect, type LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const origin = String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(/\/$/, '');
  if (!origin) return redirect('/dev/blackboard-lti-mock/');
  const target = new URL('/api/v1/gateway/oidcauth', origin);
  // Forward required params; mock accepts extras as well
  for (const [key, value] of url.searchParams.entries()) {
    target.searchParams.set(key, value);
  }
  // Ensure redirect_uri points back to our /lti/launch when missing
  if (!target.searchParams.get('target_link_uri')) {
    const launch = new URL('/lti/launch', url.origin);
    target.searchParams.set('target_link_uri', launch.toString());
  }
  return redirect(target.toString());
}

