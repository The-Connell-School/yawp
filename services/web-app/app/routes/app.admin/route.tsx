import {
  data as dataResponse,
  Link,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import { Outlet } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { Button } from '~/components/ui/button';
import {
  User,
  GraduationCap,
  ScrollText,
  ClipboardList,
  Settings,
  FlaskConical,
} from 'lucide-react';
import { requireAdmin } from '~/utils/auth.server';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';

export const adminTabs = [
  {
    label: 'General',
    to: '/app/admin/general',
    icon: <Settings size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Organizations',
    to: '/app/admin/organizations',
    icon: <User size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Assignment Types',
    to: '/app/admin/assignments',
    icon: <ClipboardList size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Teacher Courses',
    to: '/app/admin/teacher-trainings',
    icon: <GraduationCap size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'AI Evaluations',
    to: '/app/admin/ai-evaluations',
    icon: <FlaskConical size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Audit',
    to: '/app/admin/audit',
    icon: <ScrollText size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Free tier',
    to: '/app/admin/free-tier',
    icon: <User size={16} className="opacity-75 mr-1" />,
  },
];

export const handle: BreadcrumbHandle = { breadcrumb: 'Admin' };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return dataResponse({ freeTierEnabled: await isFreeTierEnabled() });
}

export default function Route() {
  const { freeTierEnabled } = useLoaderData<typeof loader>();
  const location = useLocation();
  const pathname = location.pathname;
  const visibleTabs = adminTabs.filter(
    (tab) => tab.to !== '/app/admin/free-tier' || freeTierEnabled
  );
  const currentTab =
    pathname.startsWith('/app/admin/assignments') ||
    pathname.startsWith('/app/admin/assignment-types')
      ? visibleTabs.find((tab) => tab.to === '/app/admin/assignments')
      : visibleTabs.find((tab) => pathname.startsWith(tab.to));

  return (
    <main className="flex flex-col h-screen">
      <div className="py-2 md:py-4 px-3 md:px-6 border-b">
        <h1 className="mb-3 text-2xl md:text-3xl">{currentTab?.label}</h1>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {visibleTabs.map((tab) => (
            <Button
              key={tab.to}
              variant={currentTab?.to === tab.to ? 'secondary' : 'ghost'}
              size="sm"
              asChild
            >
              <Link to={tab.to}>
                {tab.icon}
                {tab.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      <div className="flex-grow overflow-auto pb-24">
        <Outlet />
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
