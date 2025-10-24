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
import { BookOpen, Building2, Users, GraduationCap } from 'lucide-react';
import {
  requireAdmin,
  requireOwner,
  requireProfile,
} from '~/utils/auth.server';

const tabs = [
  {
    label: 'Classes',
    to: '/app/organization/classes',
    icon: <BookOpen size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Schools',
    to: '/app/organization/schools',
    icon: <Building2 size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Teachers',
    to: '/app/organization/teachers',
    icon: <Users size={16} className="opacity-75 mr-1" />,
  },
  {
    label: 'Students',
    to: '/app/organization/students',
    icon: <GraduationCap size={16} className="opacity-75 mr-1" />,
  },
];

export const handle: BreadcrumbHandle = { breadcrumb: 'Organization' };

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
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
      <div className="flex-grow overflow-auto">
        <Outlet />
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
