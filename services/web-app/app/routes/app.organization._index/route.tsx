import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import { Outlet } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { requireAdmin } from '~/utils/permissions';

export const handle: BreadcrumbHandle = { breadcrumb: 'Admin' };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return dataResponse({});
}

export default function Route() {
  return (
    <main className="flex flex-col h-screen">
      <div className="py-2 md:py-4 px-3 md:px-6 border-b">
        <h1 className="mb-3 text-2xl md:text-3xl">Manage your organization</h1>
      </div>
      <div className="flex-grow overflow-auto pb-24">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-2xl font-bold opacity-90">
            Manage your organization
          </h2>
        </div>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
