/**
 * A download that shows it's working (Kevin, Oct 25, note 10b). The lesson's
 * files are made on the spot, so a plain link looked broken for the seconds a
 * Word file or PDF takes, and a failed one saved an error page as the file.
 * This one says "Preparing…", saves only a real file, and says so when it
 * can't. Without script it is still the plain link.
 */
import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '~/utils/misc';

/**
 * A name a browser keeps for a saved file. Chromium drops a script-made
 * download's name with any letter outside plain ASCII ("Day 1 — …") and saves
 * it as "download", so accents, dashes and curly quotes are folded first.
 */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
      .replace(/[\u201c-\u201f]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'download'
  );
}

/** The file name a response asks for, or the link's own last segment. */
export function downloadName(disposition: string | null, href: string): string {
  return safeFileName(rawDownloadName(disposition, href));
}

function rawDownloadName(disposition: string | null, href: string): string {
  const star = disposition && /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1]!);
    } catch {
      // Fall through to the plain name.
    }
  }
  const plain = disposition && /filename="?([^";]+)"?/i.exec(disposition);
  if (plain) return plain[1]!;
  return href.split('?')[0]!.split('/').pop() || 'download';
}

/** A response worth saving: not an error, not a page. */
export function isFile(response: { ok: boolean; headers: { get(name: string): string | null } }): boolean {
  const type = response.headers.get('content-type') ?? '';
  return response.ok && !/text\/(html|plain)/i.test(type);
}

export function DownloadLink({
  href,
  className,
  children,
  testId,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(href, { credentials: 'same-origin' });
      if (!isFile(response)) {
        const said = response.headers.get('content-type')?.startsWith('text/plain') ? (await response.text()).trim() : '';
        setProblem(said && said.length < 160 ? said : 'Didn’t download. Try again.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName(response.headers.get('content-disposition'), href);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      // Kept a moment: a browser can read the name after the click returns.
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 30_000);
    } catch {
      setProblem('Didn’t download. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <a
        href={href}
        download
        onClick={save}
        aria-busy={busy}
        data-testid={testId}
        className={cn(className, busy && 'cursor-wait opacity-80')}
      >
        {busy ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 size={13} className="animate-spin" aria-hidden /> Preparing…
          </span>
        ) : (
          children
        )}
      </a>
      {problem ? (
        <span role="status" data-testid={testId ? `${testId}-problem` : undefined} className="mt-1 max-w-[16rem] text-xs text-amber-200">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
