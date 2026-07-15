import { useRef, useState, useEffect } from 'react';

type Params = {
  height?: string;
  onCmdEnter?: (text: string) => void;
  // When true, a plain Enter submits (Shift+Enter still inserts a newline).
  // Cmd/Ctrl+Enter always submits regardless of this flag.
  submitOnEnter?: boolean;
};

export const useRichTextarea = ({
  onCmdEnter,
  height = '50px',
  submitOnEnter = false,
}: Params) => {
  const heightInt = parseInt(height.slice(0, 2));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasText, setHasText] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      const lineHeight = parseFloat(
        getComputedStyle(textareaRef.current).lineHeight
      );
      textareaRef.current.style.height = Math.max(heightInt, lineHeight) + 'px';
    }
  }, [heightInt]);

  const handleTextareaChange = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = height;
      textareaRef.current.style.height =
        Math.max(heightInt, textareaRef.current.scrollHeight + 3) + 'px';

      setHasText(!!textareaRef.current.value);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    // Don't submit mid-IME-composition (e.g. choosing a character candidate).
    if (event.nativeEvent.isComposing) return;

    const withModifier = event.metaKey || event.ctrlKey;
    // Shift+Enter always inserts a newline; plain Enter only submits when the
    // consumer opts in. Cmd/Ctrl+Enter always submits.
    const shouldSubmit = withModifier || (submitOnEnter && !event.shiftKey);
    if (!shouldSubmit) return;

    // Swallow the keystroke so Enter never leaves a stray newline behind.
    event.preventDefault();
    if (!hasText) return;

    if (textareaRef.current?.value) {
      onCmdEnter?.(textareaRef.current.value);
    }

    textareaRef.current!.value = '';
    setHasText(false);

    if (textareaRef.current) {
      const lineHeight = parseFloat(
        getComputedStyle(textareaRef.current).lineHeight
      );
      textareaRef.current.style.height = Math.max(heightInt, lineHeight) + 'px';
    }
  };

  return {
    textareaRef,
    handleTextareaChange,
    handleKeyDown,
    hasText,
    setHasText,
  };
};
