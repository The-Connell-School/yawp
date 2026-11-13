import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export const ASSIGNMENT_LINK_COPIED_TOAST =
  'Link copied. Paste it into Google Classroom.';
export const ASSIGNMENT_LINK_COPY_ERROR_TOAST =
  "Couldn't copy. Select the link below.";

const COPIED_RESET_MS = 2000;
const COPY_ERROR_TOAST_MS = 4000;

export function useAssignmentLinkCopy(url: string) {
  const [copied, setCopied] = useState(false);
  const [showFallbackLink, setShowFallbackLink] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  const errorToastTimer = useRef<ReturnType<typeof setTimeout>>();
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!showFallbackLink || !fallbackInputRef.current) return;
    const input = fallbackInputRef.current;
    input.focus();
    input.select();
  }, [showFallbackLink]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setShowFallbackLink(false);
      toast.success(ASSIGNMENT_LINK_COPIED_TOAST, { duration: COPIED_RESET_MS });
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setShowFallbackLink(true);
      toast.error(ASSIGNMENT_LINK_COPY_ERROR_TOAST, {
        duration: COPY_ERROR_TOAST_MS,
      });
    }
  }, [url]);

  return {
    copied,
    showFallbackLink,
    copy,
    fallbackInputRef,
  };
}
