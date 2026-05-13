import {
  data as dataResponse,
  Link,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import { Outlet } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { Button } from '~/components/ui/button';
import {
  Settings2,
  Book,
  User,
  GraduationCap,
  ScrollText,
  ToggleLeft,
} from 'lucide-react';
import { requireAdmin } from '~/utils/auth.server';

const tabs = [
  {
    label: 'General',
    to: '/app/admin/general',
    icon: <Settings2 size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Organizations',
    to: '/app/admin/organizations',
    icon: <User size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Feature Flags',
    to: '/app/admin/feature-flags',
    icon: <ToggleLeft size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Assignment Types',
    to: '/app/admin/assignment-types',
    icon: <Book size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Teacher Courses',
    to: '/app/admin/teacher-trainings',
    icon: <GraduationCap size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Audit',
    to: '/app/admin/audit',
    icon: <ScrollText size={16} className="opacity-75 mr-1" />,
  },
];

export const handle: BreadcrumbHandle = { breadcrumb: 'Admin' };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return dataResponse({});
}

export default function Route() {
  const location = useLocation();
  const pathname = location.pathname;
  const currentTab = tabs.find((tab) => pathname.startsWith(tab.to));

  return (
    <main className="flex flex-col h-screen">
      <div className="py-2 md:py-4 px-3 md:px-6 border-b">
        <h1 className="mb-3 text-2xl md:text-3xl">{currentTab?.label}</h1>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
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
