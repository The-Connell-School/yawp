import { Clock } from 'lucide-react';
import { Link } from 'react-router';
import { teachingAccessBannerMessage } from '~/domain/free-tier/teaching-access-copy';

export function TeachingAccessBanner({ adminName }: { adminName: string }) {
  return (
    <div
      data-testid="teaching-access-banner"
      role="status"
      className="border-b bg-secondary/60 px-3 py-2.5 sm:px-5"
    >
      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-start gap-2 text-foreground">
          <Clock
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0"
            aria-hidden
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {teachingAccessBannerMessage(adminName)}
          </span>
        </div>
        <Link
          to="/app/free-tier/pending"
          className="shrink-0 pl-6 text-primary underline underline-offset-4 sm:pl-0"
        >
          View status
        </Link>
      </div>
    </div>
  );
}
