import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

/** Shared field for admin, teacher create, and teacher edit forms. */
export function ClassCodeInput({ id, value, onChange, onGenerate, enabled, error }: {
  id: string; value: string; onChange: (value: string) => void;
  onGenerate: () => void; enabled: boolean; error?: string | null;
}) {
  const [announcement, setAnnouncement] = useState('');
  return <>
    <Input id={id} value={value} placeholder="A3B9X2" required className="font-mono"
      aria-invalid={enabled && Boolean(error)}
      aria-describedby={enabled && error ? `${id}-error` : undefined}
      onChange={event => { onChange(event.target.value.toUpperCase()); setAnnouncement(''); }} />
    {enabled ? <>
      <Button type="button" variant="outline" size="sm" onClick={() => {
        onGenerate(); setAnnouncement('New class code generated. Save the form to use it.');
      }}>Generate code</Button>
      <span className="sr-only" role="status">{announcement}</span>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </> : null}
  </>;
}
