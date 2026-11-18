import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { SiteLicenseHowToTeachLockedSection } from '~/components/free-tier/site-license-how-to-teach-lock';
import { Button } from '~/components/ui/button';
import { SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE } from '~/domain/free-tier/site-license-how-to-teach';

/**
 * Full-page locked state when a free teacher opens a How to Teach It tutorial
 * URL directly (document navigation keeps HTTP 403).
 */
export function TutorialSiteLicenseLockedView({
  assignmentTypePagePath,
}: {
  assignmentTypePagePath: string;
}) {
  return (
    <section className="h-full w-full overflow-y-auto" data-testid="tutorial-site-license-locked">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-6">
        <div>
          <Button variant="outline" size="sm" asChild>
            <Link to={assignmentTypePagePath}>
              <ChevronLeft size={16} className="mr-1" />
              Back to assignment type
            </Link>
          </Button>
        </div>
        <SiteLicenseHowToTeachLockedSection heading="How to Teach It">
          <p
            className="text-sm text-muted-foreground"
            data-testid="tutorial-site-license-lock-message"
          >
            {SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE}
          </p>
        </SiteLicenseHowToTeachLockedSection>
      </div>
    </section>
  );
}