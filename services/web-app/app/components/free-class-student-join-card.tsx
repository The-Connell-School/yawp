import { QrCode, Copy, Expand } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export function FreeClassStudentJoinCard({
  joinUrl,
  classCode,
  compact = false,
}: {
  joinUrl: string;
  classCode: string;
  compact?: boolean;
}) {
  const [showQr, setShowQr] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
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

  if (compact)
    return (
      <div className="rounded-xl border bg-popover p-5 shadow-sm">
        <h3 className="text-sm font-semibold">How students join</h3>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-xs text-muted-foreground">Class code</p>
              <p className="break-all font-mono text-3xl font-semibold tracking-wide">
                {classCode}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Students open the join link to create their account.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-expanded={showBoard}
                onClick={() => setShowBoard(!showBoard)}
              >
                <Expand size={14} className="mr-2" />
                Show on board
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(joinUrl)}
              >
                <Copy size={14} className="mr-2" />
                Copy join link
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label="QR code"
            aria-expanded={showQr}
            onClick={() => setShowQr(!showQr)}
            className="flex size-28 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border bg-popover p-2 text-xs text-muted-foreground"
          >
            {showQr && qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code for class join link"
                className="size-24"
              />
            ) : (
              <>
                <QrCode size={36} />
                QR code
              </>
            )}
          </button>
        </div>
        {showBoard && (
          <div data-testid="free-class-board" className="mt-4 rounded-lg bg-secondary p-8 text-center">
            <p className="break-all font-mono text-4xl font-bold">
              {classCode}
            </p>
            <p className="mt-3 break-all text-sm">{joinUrl}</p>
          </div>
        )}
      </div>
    );

  return (
    <div
      data-tour="class-join-link"
      className="rounded-lg border bg-muted/30 p-4"
    >
      <h3 className="text-sm font-semibold">Student join link</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Share this link or QR code so students can create handle accounts. Class
        code <span className="font-mono">{classCode}</span> is for your
        reference only.
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
