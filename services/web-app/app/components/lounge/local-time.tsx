import { useEffect, useState } from 'react';

const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * A date and time in the reader's own time zone. The server renders it in
 * UTC; the browser swaps in local time once it hydrates.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() =>
    new Date(iso).toLocaleString('en-US', { ...FORMAT, timeZone: 'UTC', timeZoneName: 'short' })
  );
  useEffect(() => {
    setLabel(new Date(iso).toLocaleString('en-US', FORMAT));
  }, [iso]);
  return <time dateTime={iso}>{label}</time>;
}

/**
 * A "when should this go live" picker. The visible field is local time; a
 * hidden field carries the exact moment (ISO) so the server never guesses
 * the reader's time zone.
 */
export function LocalDateTimeInput({ id, name, label }: { id: string; name: string; label: string }) {
  const [iso, setIso] = useState('');
  return (
    <span className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        onChange={(event) => {
          const when = event.target.value ? new Date(event.target.value) : null;
          setIso(when && !Number.isNaN(when.getTime()) ? when.toISOString() : '');
        }}
        className="h-11 rounded-md border border-input bg-input-background px-3 text-[15px]"
      />
      <input type="hidden" name={name} value={iso} />
    </span>
  );
}
