import { Check, Link2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';

type AssignmentCopyLinkButtonProps = {
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
  /** Shown when collab groups are not opened yet (~300ms delay). */
  collabGroupsPendingTooltip?: string;
  className?: string;
  'data-testid'?: string;
};

export function AssignmentCopyLinkButton({
  copied,
  onCopy,
  disabled,
  collabGroupsPendingTooltip,
  className,
  'data-testid': dataTestId = 'assignment-copy-link',
}: AssignmentCopyLinkButtonProps) {
  const button = (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={() => void onCopy()}
      className={cn(
        'border-border bg-background hover:bg-[#f0eeea]',
        copied && 'text-emerald-700 hover:bg-background',
        className
      )}
      data-testid={dataTestId}
      data-copied={copied ? 'true' : undefined}
    >
      {copied ? (
        <Check className="mr-2 h-4 w-4 text-emerald-700" aria-hidden />
      ) : (
        <Link2 className="mr-2 h-4 w-4" aria-hidden />
      )}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );

  if (!collabGroupsPendingTooltip) return button;

  return (
    <Tooltip text={collabGroupsPendingTooltip} delayDuration={300}>
      {button}
    </Tooltip>
  );
}
