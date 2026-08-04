import {
  CheckIcon,
  ChevronLeft,
  ChevronRightIcon,
  MessageCircleIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { RichTextarea } from '~/components/rich-textarea';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip.js';
import { cn } from '~/utils/misc.js';
import { useNavigation } from 'react-router';

type Props = {
  buttons: { label: string; action: string }[] | null;
  showChatButton?: boolean;
  showNextButton?: boolean;
  className?: string;
  advanceInstruction?: (label?: string) => void;
  respond: (response: string) => void | Promise<void>;
  disabled?: boolean;
};

export const ResponseBar = ({
  buttons,
  showChatButton,
  showNextButton,
  advanceInstruction,
  respond,
  className,
  disabled = false,
}: Props) => {
  const navigation = useNavigation();
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [check, setCheck] = useState(false);
  const isPending = navigation.state !== 'idle';
  const isDisabled = disabled || isPending;

  useEffect(() => {
    if (disabled) {
      setIsAskingQuestion(false);
      setCheck(false);
    }
  }, [disabled]);

  return isAskingQuestion ? (
    <div
      className={cn(
        'flex w-full items-center justify-center gap-2 px-3',
        className
      )}
    >
      <Button
        size="lg"
        variant="secondary"
        className="shrink-0 px-2"
        aria-label="Return to tutor choices"
        data-testid="tutor-chat-back"
        disabled={isDisabled}
        onClick={() => setIsAskingQuestion(false)}
      >
        <ChevronLeft />
      </Button>
      <div className="flex w-full max-w-[700px] items-center justify-center">
        <RichTextarea
          onCmdEnter={(message) => {
            if (isDisabled) return;
            void respond(message);
          }}
          textareaTestId="tutor-chat-input"
          sendButtonTestId="tutor-chat-send"
          aria-label="Ask tutor a question"
          disabled={isDisabled}
        />
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
          disabled={isDisabled}
          onClick={() => {
            if (isDisabled) return;
            if (button.action === 'advance') {
              return advanceInstruction?.(button.label);
            } else if (button.action === 'response') {
              return void respond(button.label);
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
          aria-label="Ask the tutor a question"
          data-testid="tutor-chat-open"
          disabled={isDisabled}
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
            aria-label={check ? 'Confirm next tutor step' : 'Next tutor step'}
            onClick={() => {
              if (isDisabled) return;
              if (check) {
                setCheck(false);
                advanceInstruction && advanceInstruction();
              } else {
                setCheck(true);
              }
            }}
            onBlur={() => check && setCheck(false)}
            disabled={isDisabled}
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
