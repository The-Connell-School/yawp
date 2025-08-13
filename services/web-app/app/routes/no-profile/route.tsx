import { requireUserId } from '~/utils/auth.server';
import { type LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
}

export default function Route() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold">No Profile</h1>
      <p className="text-sm text-muted-foreground">
        You don't have a profile yet. Please contact your administrator.
      </p>
    </div>
  );
}
