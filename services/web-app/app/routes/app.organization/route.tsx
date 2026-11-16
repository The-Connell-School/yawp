import {
  data as dataResponse,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import { Outlet } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { ScrollTabBar } from '~/components/ui/scroll-tab-bar';
import { BookOpen, Building2, Users, GraduationCap } from 'lucide-react';
import {
  requireAdmin,
  requireOwner,
  requireMembership,
} from '~/utils/auth.server';

const tabs = [
  {
    label: 'Classes',
    to: '/app/organization/classes',
    icon: <BookOpen className="opacity-75" />,
  },
  {
    label: 'Schools',
    to: '/app/organization/schools',
    icon: <Building2 className="opacity-75" />,
  },
  {
    label: 'Teachers',
    to: '/app/organization/teachers',
    icon: <Users className="opacity-75" />,
  },
  {
    label: 'Students',
    to: '/app/organization/students',
    icon: <GraduationCap className="opacity-75" />,
  },
];

export const handle: BreadcrumbHandle = { breadcrumb: 'Organization' };

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireMembership(request, user.id);
  return dataResponse({ organization: profile.organization });
}

export default function Route() {
  const { organization } = useLoaderData<typeof loader>();
  const location = useLocation();
  const pathname = location.pathname;
  const currentTab = tabs.find((tab) => pathname.startsWith(tab.to));

  return (
    <main className="flex flex-col h-screen">
      <div className="py-2 md:py-4 px-3 md:px-6 border-b">
        <h1 className="mb-3 text-2xl md:text-3xl">{organization.name}</h1>
        <ScrollTabBar
          tabs={tabs}
          activeTo={currentTab?.to}
          ariaLabel="Organization sections"
          data-tour="organization-tabs"
        />
      </div>
      <div className="flex-grow overflow-auto" data-tour="organization-content">
        <Outlet />
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
