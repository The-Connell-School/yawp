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
      <div className="mx-auto flex w-full max-w-screen-lg items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2 text-foreground">
          <Clock
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate">
            {teachingAccessBannerMessage(adminName)}
          </span>
        </div>
        <Link
          to="/app/free-tier/pending"
          className="shrink-0 text-primary underline underline-offset-4"
        >
          View status
        </Link>
      </div>
    </div>
  );
}
