import { Link } from 'react-router';
import { Button } from '~/components/ui/button';

export const PENDING_ADDITIONAL_ADMINISTRATOR_COPY =
  'Not the right person? / Send to an additional administrator' as const;

export function PendingAdditionalAdministratorLink({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="link"
      asChild
      className={`h-auto min-h-0 justify-start p-0 text-left text-sm font-normal underline${
        disabled ? ' pointer-events-none opacity-50' : ''
      }`}
      data-testid="pending-additional-administrator-link"
      aria-disabled={disabled ? true : undefined}
    >
      <Link
        to="/app/free-tier/onboarding?additional=1"
        tabIndex={disabled ? -1 : undefined}
        aria-disabled={disabled ? true : undefined}
        onClick={
          disabled
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
      >
        {PENDING_ADDITIONAL_ADMINISTRATOR_COPY}
      </Link>
    </Button>
  );
}
