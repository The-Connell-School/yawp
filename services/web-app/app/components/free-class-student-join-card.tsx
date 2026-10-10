import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export function FreeClassStudentJoinCard({
  joinUrl,
  classCode,
}: {
  joinUrl: string;
  classCode: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <div
      data-tour="class-join-link"
      className="rounded-lg border bg-muted/30 p-4"
    >
      <h3 className="text-sm font-semibold">Student join link</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Share this link or QR code so students can create handle accounts. Class
        code <span className="font-mono">{classCode}</span> is for your reference
        only.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-2">
          <Label className="text-xs">Join URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={joinUrl} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(joinUrl)}
            >
              Copy
            </Button>
          </div>
        </div>
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code for class join link"
            className="size-[200px] rounded-md border bg-white"
          />
        ) : null}
      </div>
    </div>
  );
}
