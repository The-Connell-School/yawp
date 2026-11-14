import {
  CheckIcon,
  ChevronLeft,
  ChevronRightIcon,
  MessageCircleIcon,
  Send,
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
  // Open straight into the chat input instead of the choices row — used once a
  // back-and-forth conversation is already underway.
  defaultOpen?: boolean;
  // The session is read-only (e.g. submitted). Collapses the chat input.
  locked?: boolean;
};

export const ResponseBar = ({
  buttons,
  showChatButton,
  showNextButton,
  advanceInstruction,
  respond,
  className,
  disabled = false,
  defaultOpen = false,
  locked = false,
}: Props) => {
  const navigation = useNavigation();
  const hasButtons = !!buttons && buttons.length > 0;
  const [isAskingQuestion, setIsAskingQuestion] = useState(
    () => defaultOpen && !!showChatButton && !hasButtons
  );
  const [check, setCheck] = useState(false);
  const isPending = navigation.state !== 'idle';
  const isDisabled = disabled || isPending;

  // Collapse back to the choices only when the session is locked — NOT while a
  // tutor response is in flight. Collapsing on every pending state is what made
  // the chat box snap shut after each message.
  useEffect(() => {
    if (locked) setIsAskingQuestion(false);
  }, [locked]);

  useEffect(() => {
    if (isDisabled) setCheck(false);
  }, [isDisabled]);

  return isAskingQuestion ? (
  <div className={cn('flex flex-col', className)}>
      <div className="doc-editor-tutor-input-shell flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-1 shrink-0"
          aria-label="Return to tutor choices"
          data-testid="tutor-chat-back"
          disabled={isDisabled}
          onClick={() => setIsAskingQuestion(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <RichTextarea
          className="border-0 bg-transparent shadow-none"
          placeholder="Ask your tutor…"
          onCmdEnter={(message) => {
            if (isDisabled) return;
            void respond(message);
          }}
          submitOnEnter
          textareaTestId="tutor-chat-input"
          sendButtonTestId="tutor-chat-send"
          aria-label="Ask your tutor"
          disabled={isDisabled}
        />
      </div>
    </div>
  ) : (
    <>
      {showChatButton ? (
        <button
          type="button"
          className="doc-editor-tutor-ask-row"
          data-testid="tutor-ask-open"
          disabled={isDisabled}
          onClick={() => setIsAskingQuestion(true)}
        >
          <span>Ask your tutor…</span>
          <span className="doc-editor-tutor-ask-row-send" aria-hidden>
            <Send size={15} />
          </span>
        </button>
      ) : null}
    <div
      className={cn('doc-editor-tutor-footer flex-wrap', className)}
    >
      {buttons?.map((button, index) => {
        const isReady = button.label.trim() === 'Ready!';
        return (
        <Button
          key={index}
          variant={isReady ? 'default' : 'secondary'}
          size={isReady ? 'lg' : 'default'}
          block={isReady}
          className={cn('flex items-center gap-1', isReady ? '' : 'text-lg')}
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
          loading={isPending}
        >
          {button.label}
        </Button>
      );
      })}
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
            loading={isPending}
          >
            {check ? 'You sure?' : <ChevronRightIcon />}
            {check ? <CheckIcon /> : null}
          </Button>
        </Tooltip>
      ) : null}
    </div>
    </>
  );
};
