import { auditMovedToInternal } from '~/utils/admin-audit-migration.server';
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
import {
  User,
  GraduationCap,
  ScrollText,
  ClipboardList,
  Settings,
  FlaskConical,
  MessageSquare,
  MessagesSquare,
  Flag,
} from 'lucide-react';
import { requireAdmin } from '~/utils/auth.server';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';

export const adminTabs = [
  {
    label: 'Tester feedback (moved)',
    to: '/app/tester/feedback',
    icon: <MessageSquare className="opacity-75" />,
  },
  {
    label: 'General',
    to: '/app/admin/general',
    icon: <Settings className="opacity-75" />,
  },
  {
    label: 'Organizations',
    to: '/app/admin/organizations',
    icon: <User className="opacity-75" />,
  },
  {
    label: 'Assignment Types',
    to: '/app/admin/assignments',
    icon: <ClipboardList className="opacity-75" />,
  },
  {
    label: 'Teacher Courses',
    to: '/app/admin/teacher-trainings',
    icon: <GraduationCap className="opacity-75" />,
  },
  {
    label: 'Grading Evaluations',
    to: '/app/admin/ai-evaluations',
    icon: <FlaskConical className="opacity-75" />,
  },
  {
    label: 'Lounge',
    to: '/app/admin/lounge',
    icon: <MessagesSquare className="opacity-75" />,
  },
  {
    label: 'Audit',
    to: '/app/admin/audit',
    icon: <ScrollText className="opacity-75" />,
  },
  {
    label: 'Free tier',
    to: '/app/admin/free-tier',
    icon: <User className="opacity-75" />,
  },
  {
    label: 'Access & flags',
    to: '/app/admin/access-flags',
    icon: <Flag className="opacity-75" />,
  },
];

export const handle: BreadcrumbHandle = { breadcrumb: 'Admin' };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return dataResponse({
    freeTierEnabled: await isFreeTierEnabled(),
    auditMoved: auditMovedToInternal(),
  });
}

export default function Route() {
  const { freeTierEnabled, auditMoved } = useLoaderData<typeof loader>();
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
        <ScrollTabBar
          tabs={visibleTabs}
          activeTo={currentTab?.to}
          ariaLabel="Admin sections"
          testId="admin-section-tabs"
          labelFor={(tab) =>
            tab.to === '/app/admin/audit' && auditMoved ? 'Audit (moved)' : tab.label
          }
        />
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
