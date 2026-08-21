import { redirect, type LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // Always route through same-origin proxy; browsers cannot resolve the Docker service name.
  const target = new URL('/dev/blackboard-lti-mock/api/v1/gateway/oidcauth', url.origin);
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

