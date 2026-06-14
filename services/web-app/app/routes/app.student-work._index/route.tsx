import { type LoaderFunctionArgs, redirect } from 'react-router';

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/app/documents${url.search}`);
}
