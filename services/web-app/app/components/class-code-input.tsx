import { useEffect, useId, useMemo } from 'react';
import { useFetcher } from 'react-router';
import { Check, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useDebounce } from '~/hooks/useDebounce';
import { CLASS_CODE_COLLISION_MESSAGE } from '~/utils/class-code-messages';
import { cn } from '~/utils/misc';

type AvailabilityResponse =
  | { enforcementEnabled: false }
  | { enforcementEnabled: true; available: boolean; normalizedCode: string };

/** Shared field for admin, teacher create, and teacher edit forms. */
export function ClassCodeInput({
  id,
  value,
  onChange,
  onGenerate,
  enabled,
  error,
  excludeClassId,
  skipLiveAvailability = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  enabled: boolean;
  error?: string | null;
  /** When editing, the class being updated may keep its current code. */
  excludeClassId?: string;
  /** Generated/auto codes skip live taken checks until the teacher edits the field. */
  skipLiveAvailability?: boolean;
}) {
  const statusId = useId();
  const [debouncedCode, isDebouncing] = useDebounce(value, 400);
  const availabilityFetcher = useFetcher<AvailabilityResponse>({
    key: `class-code-availability-${id}`,
  });

  const trimmedDebounced = debouncedCode.trim();
  const shouldCheckLive =
    enabled &&
    !skipLiveAvailability &&
    trimmedDebounced.length > 0 &&
    !error;

  useEffect(() => {
    if (!shouldCheckLive) return;
    const params = new URLSearchParams({ code: debouncedCode });
    if (excludeClassId) params.set('excludeClassId', excludeClassId);
    availabilityFetcher.load(
      `/api/class-code-availability?${params.toString()}`
    );
  }, [shouldCheckLive, debouncedCode, excludeClassId]);

  const liveState = useMemo(() => {
    if (!shouldCheckLive) return null;
    if (
      isDebouncing ||
      availabilityFetcher.state !== 'idle' ||
      !availabilityFetcher.data
    ) {
      return 'pending' as const;
    }
    if (!availabilityFetcher.data.enforcementEnabled) return null;
    const normalized = trimmedDebounced.toUpperCase();
    if (availabilityFetcher.data.normalizedCode !== normalized) {
      return 'pending' as const;
    }
    return availabilityFetcher.data.available ? ('available' as const) : ('taken' as const);
  }, [
    shouldCheckLive,
    isDebouncing,
    availabilityFetcher.state,
    availabilityFetcher.data,
    trimmedDebounced,
  ]);

  const liveError =
    liveState === 'taken' ? CLASS_CODE_COLLISION_MESSAGE : null;
  const displayError = error ?? liveError;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder="A3B9X2"
          required
          className={cn('font-mono', enabled && 'pr-10')}
          aria-invalid={enabled && Boolean(displayError)}
          aria-describedby={
            enabled && displayError
              ? `${id}-error`
              : liveState === 'available'
                ? statusId
                : undefined
          }
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        {enabled && liveState === 'available' ? (
          <Check
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600"
            aria-hidden
          />
        ) : null}
        {enabled && liveState === 'taken' ? (
          <X
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive"
            aria-hidden
          />
        ) : null}
      </div>
      {enabled ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGenerate()}
          >
            Generate code
          </Button>
          {liveState === 'available' ? (
            <p id={statusId} className="text-sm text-emerald-700">
              This code is available.
            </p>
          ) : null}
          {displayError ? (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {displayError}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
