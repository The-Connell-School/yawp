import {
  CheckIcon,
  ChevronLeft,
  ChevronRightIcon,
  MessageCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { RichTextarea } from '~/components/rich-textarea';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip.js';
import { cn, useIsPending } from '~/utils/misc.js';

type Props = {
  buttons: { label: string; action: string }[] | null;
  showChatButton?: boolean;
  showNextButton?: boolean;
  className?: string;
  advanceInstruction?: () => void;
  respond: (response: string) => void;
};

export const ResponseBar = ({
  buttons,
  showChatButton,
  showNextButton,
  advanceInstruction,
  respond,
  className,
}: Props) => {
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [check, setCheck] = useState(false);
  const isPending = useIsPending();

  return isAskingQuestion ? (
    <div
      className={cn('flex w-full items-center justify-center px-3', className)}
    >
      <Button
        size="lg"
        variant="secondary"
        className="px-2"
        onClick={() => setIsAskingQuestion(false)}
      >
        <ChevronLeft />
      </Button>
      <div className="flex w-full items-center justify-center px-3">
        <RichTextarea onCmdEnter={respond} />
      </div>
    </div>
  ) : (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-2 border-t p-2 pb-5 md:pb-4',
        className
      )}
    >
      {buttons?.map((button, index) => (
        <Button
          key={index}
          variant="secondary"
          className={cn('flex items-center gap-1 text-lg')}
          onClick={() => {
            if (button.action === 'advance') {
              return advanceInstruction?.();
            } else if (button.action === 'response') {
              return respond(button.label);
            } else {
              throw new Error('Invalid button action');
            }
          }}
          isLoading={isPending}
        >
          {button.label}
        </Button>
      ))}
      {showChatButton ? (
        <Button
          variant="secondary"
          className="flex items-center gap-2 text-lg"
          onClick={() => setIsAskingQuestion(true)}
        >
          <MessageCircleIcon />
          {buttons && buttons.length > 0 ? '' : 'Chat'}
        </Button>
      ) : null}
      {showNextButton ? (
        <Tooltip
          text="Next step"
          delayDuration={200}
          open={check === true || undefined}
        >
          <Button
            variant={check ? 'default' : 'secondary'}
            className={cn('flex items-center gap-1 text-lg', {})}
            onClick={() => {
              if (check) {
                setCheck(false);
                advanceInstruction && advanceInstruction();
              } else {
                setCheck(true);
              }
            }}
            onBlur={() => check && setCheck(false)}
            isLoading={isPending}
          >
            {check ? 'You sure?' : <ChevronRightIcon />}
            {check ? <CheckIcon /> : null}
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
};
