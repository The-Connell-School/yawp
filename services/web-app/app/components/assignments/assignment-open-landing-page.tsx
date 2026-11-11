import { Link } from 'react-router';
import {
  Calendar,
  DoorOpen,
  Lock,
  Users,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { AssignmentOpenLoaderState } from '~/routes/app.assignments.$assignmentId.open/route';
import useBreakpoint from '~/hooks/useBreakpoint';
import { cn } from '~/utils/misc';

type AssignmentOpenLandingPageProps = {
  data: AssignmentOpenLoaderState;
};

function formatOpensAt(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AssignmentOpenLandingPage({
  data,
}: AssignmentOpenLandingPageProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'base' || breakpoint === 'sm';

  const content = (() => {
    switch (data.state) {
      case 'not-in-class':
        return {
          testId: 'open-not-in-class',
          icon: DoorOpen,
          title: "You're not in this class",
          body: data.classLabel
            ? `This link is for ${data.classLabel}. Join the class with the code from your teacher, then open the link again.`
            : 'Join the class with the code from your teacher, then open the link again.',
          primary: { to: '/join', label: 'Join a class' },
          secondary: { to: '/app', label: 'Back to Yawp!' },
        };
      case 'not-posted':
        return {
          testId: 'open-not-posted',
          icon: Calendar,
          title: 'Not posted yet',
          body: `${data.assignmentTitle} opens on ${formatOpensAt(data.opensAt)}. Come back then, or find it in My Classes when it opens.`,
          secondary: { to: '/app', label: 'Back to Yawp!' },
        };
      case 'groups-not-open':
        return {
          testId: 'open-groups-not-open',
          icon: Users,
          title: "Groups aren't open yet",
          body: data.assignmentTitle
            ? `Your teacher is still setting up groups for ${data.assignmentTitle}. You'll be able to open it once groups are open.`
            : "Your teacher is still setting up groups for this assignment. You'll be able to open it once groups are open.",
          secondary: { to: '/app', label: 'Back to Yawp!' },
        };
      default:
        return {
          testId: 'open-unavailable',
          icon: Lock,
          title: "This assignment isn't available",
          body: 'It may have been closed or removed. Ask your teacher for a new link.',
          secondary: { to: '/app', label: 'Back to Yawp!' },
        };
    }
  })();

  const Icon = content.icon;

  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-center px-4 py-10 md:py-16',
        isMobile ? 'px-5' : 'px-8'
      )}
    >
      <OpenLandingCard
        className={cn(
          'w-full rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm',
          isMobile ? 'max-w-none' : 'max-w-lg'
        )}
        data-testid={content.testId}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{content.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {content.body}
        </p>
        <div
          className={cn(
            'mt-8 flex flex-col gap-3',
            content.primary ? 'sm:flex-row sm:justify-center' : 'items-center'
          )}
        >
          {content.primary ? (
            <Button
              asChild
              className="bg-[#c85b3d] hover:bg-[#b45237]"
              data-testid="assignment-open-join-class"
            >
              <Link to={content.primary.to}>{content.primary.label}</Link>
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            data-testid="assignment-open-back"
          >
            <Link to={content.secondary.to}>{content.secondary.label}</Link>
          </Button>
        </div>
      </OpenLandingCard>
    </div>
  );
}

function OpenLandingCard({
  className,
  children,
  'data-testid': dataTestId,
}: {
  className?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div className={className} data-testid={dataTestId}>
      {children}
    </div>
  );
}
