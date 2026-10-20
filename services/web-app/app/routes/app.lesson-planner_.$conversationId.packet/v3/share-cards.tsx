/**
 * Post to your class and Send this lesson (stack page redesign). v1 is a
 * plain share link: no Google, Canvas or Microsoft account is connected, so
 * the teacher picks the class and the kind of post on the other side.
 */
import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Copy, Link2, PenLine, Send } from 'lucide-react';
import {
  AUDIENCE_SETUP,
  classroomShareUrl,
  POST_ITEMS,
  SHARE_AUDIENCES,
  teamsShareUrl,
  type ShareAudience,
  type ShareItem,
} from '~/domain/lesson-planner/lesson-share';
import { cn } from '~/utils/misc';
import { HEADING_FONT } from './theme';

const STACK_API = '/api/domain/lesson-planner/stack';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PostToClass({ conversationId, title }: { conversationId: string; title: string }) {
  const fetcher = useFetcher<{ url?: string; error?: string }>();
  const [items, setItems] = useState<Set<ShareItem>>(() => new Set(POST_ITEMS.map((entry) => entry.item)));
  const [madeFor, setMadeFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const wanted = [...items].sort().join(',');
  // A link opens what was checked when it was made; change the boxes and the
  // next share makes a new one.
  const url = fetcher.data?.url && madeFor === wanted ? fetcher.data.url : null;
  const pending = useRef<{ target: 'classroom' | 'teams' | 'copy'; tab: Window | null } | null>(null);

  function act(link: string, target: 'classroom' | 'teams' | 'copy', tab: Window | null) {
    if (target === 'copy') {
      tab?.close();
      void copy(link).then(setCopied);
      return;
    }
    const destination = target === 'classroom' ? classroomShareUrl(link, title) : teamsShareUrl(link, title);
    if (tab) tab.location.href = destination;
    else window.open(destination, '_blank', 'noopener');
  }

  function share(target: 'classroom' | 'teams' | 'copy') {
    if (url) {
      act(url, target, null);
      return;
    }
    // Opened now, inside the click, so a pop-up blocker lets it through; it
    // goes to Classroom or Teams once the link exists.
    pending.current = { target, tab: target === 'copy' ? null : window.open('about:blank', '_blank') };
    setMadeFor(wanted);
    fetcher.submit(
      { intent: 'create-share', conversationId, includes: wanted },
      { method: 'post', action: STACK_API }
    );
  }

  useEffect(() => {
    const link = fetcher.data?.url;
    if (fetcher.state !== 'idle' || !link || !pending.current) return;
    const { target, tab } = pending.current;
    pending.current = null;
    act(link, target, tab);
    // Once per new link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <section data-testid="post-to-class" className="mt-5 rounded-xl bg-[var(--sv-dark-panel)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#D5EBE5] text-[#1F5C4E]">
          <Link2 size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Post to your class</p>
          <p className="text-xs text-white/60">One link to a student page for this lesson</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] font-semibold text-white/70">The link opens</p>
      <div className="mt-1 flex flex-col gap-1">
        {POST_ITEMS.map((entry) => (
          <label key={entry.item} className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={items.has(entry.item)}
              onChange={() => {
                const next = new Set(items);
                if (next.has(entry.item)) next.delete(entry.item);
                else next.add(entry.item);
                setItems(next);
              }}
              className="h-4 w-4 accent-white"
            />
            {entry.label}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/60">
        Google Classroom opens in a new tab. Pick your class there and post it as an announcement,
        material or assignment.
      </p>
      <button
        type="button"
        data-testid="share-classroom"
        disabled={!items.size || fetcher.state !== 'idle'}
        onClick={() => share('classroom')}
        className="mt-2 w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-[var(--sv-ink)] transition hover:opacity-90 disabled:opacity-50"
      >
        Share to Google Classroom
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
        <span>Elsewhere:</span>
        {(['Canvas', 'Schoology'] as const).map((name) => (
          <button
            key={name}
            type="button"
            disabled={!items.size}
            onClick={() => share('copy')}
            title={`Copies the link; paste it into ${name}.`}
            className="rounded-full border border-white/25 px-2.5 py-1 font-semibold text-white"
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          disabled={!items.size}
          onClick={() => share('teams')}
          className="rounded-full border border-white/25 px-2.5 py-1 font-semibold text-white"
        >
          Teams
        </button>
        <button
          type="button"
          data-testid="share-copy"
          disabled={!items.size}
          onClick={() => share('copy')}
          className="inline-flex items-center gap-1 rounded-full border border-white/25 px-2.5 py-1 font-semibold text-white"
        >
          <Copy size={11} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {url ? (
        <p className="mt-2 break-all text-[11px] text-white/60" data-testid="share-link-text">
          {url}
        </p>
      ) : null}
    </section>
  );
}

export function SendLesson({ conversationId }: { conversationId: string }) {
  const fetcher = useFetcher<{ ok?: boolean; sentTo?: string; url?: string; error?: string }>();
  const [audience, setAudience] = useState<ShareAudience>('sub');
  const setup = AUDIENCE_SETUP[audience];
  const [checked, setChecked] = useState<Record<ShareAudience, Set<ShareItem>>>(() =>
    Object.fromEntries(
      SHARE_AUDIENCES.map((key) => [
        key,
        new Set(AUDIENCE_SETUP[key].items.filter((entry) => entry.checked).map((entry) => entry.item)),
      ])
    ) as Record<ShareAudience, Set<ShareItem>>
  );
  const items = checked[audience];
  const order: ShareAudience[] = ['sub', 'student', 'family', 'admin'];

  return (
    <section data-testid="send-lesson" className="rounded-2xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-5">
      <h2 className="text-xl font-bold" style={HEADING_FONT}>
        Send this lesson
      </h2>
      <p className="text-xs text-[var(--sv-muted)]">We rewrite it for whoever is reading.</p>
      <div role="tablist" className="mt-3 grid grid-cols-4 rounded-lg bg-[#EFE8DD] p-1 text-xs">
        {order.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={audience === key}
            onClick={() => setAudience(key)}
            className={cn(
              'rounded-md py-1.5 font-semibold transition',
              audience === key ? 'bg-[var(--sv-card)] shadow-sm' : 'text-[var(--sv-muted)]'
            )}
          >
            {AUDIENCE_SETUP[key].tab}
          </button>
        ))}
      </div>
      <fetcher.Form method="post" action={STACK_API} className="mt-4 space-y-3">
        <input type="hidden" name="intent" value="send-lesson" />
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="audience" value={audience} />
        <input type="hidden" name="includes" value={[...items].join(',')} />
        <label className="block text-xs font-semibold">
          {setup.recipientLabel}
          <input
            name="recipient"
            type="email"
            required
            placeholder="name@school.org"
            data-testid="send-recipient"
            className="mt-1 w-full rounded-lg border border-[var(--sv-line)] bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
        <div>
          <p className="text-xs font-semibold">What they get</p>
          <ul className="mt-1 space-y-1.5">
            {setup.items.map((entry) => (
              <li key={entry.item}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={items.has(entry.item)}
                    onChange={() => {
                      const next = new Set(items);
                      if (next.has(entry.item)) next.delete(entry.item);
                      else next.add(entry.item);
                      setChecked({ ...checked, [audience]: next });
                    }}
                    className="mt-0.5 h-4 w-4 accent-[var(--sv-primary)]"
                  />
                  <span>
                    {entry.label}
                    <span className="block text-xs text-[var(--sv-muted)]">{entry.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-[#FBF3E6] p-3">
          <label className="flex items-start gap-2 text-xs font-semibold">
            <PenLine size={14} className="mt-0.5 shrink-0 text-[#6B4A12]" />
            <span>
              {setup.noteLabel}
              <span className="block font-normal text-[var(--sv-muted)]">{setup.noteHint}</span>
            </span>
          </label>
          <textarea
            name="note"
            rows={3}
            aria-label={setup.noteLabel}
            placeholder={audience === 'sub' ? 'Anything they need to know to run the room…' : ''}
            className="mt-2 w-full rounded-lg border border-[var(--sv-line)] bg-white px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          data-testid="send-button"
          disabled={fetcher.state !== 'idle' || !items.size}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sv-primary)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Send size={14} /> {fetcher.state !== 'idle' ? 'Writing it for them…' : setup.button}
        </button>
        {fetcher.data?.sentTo ? (
          <p data-testid="send-done" className="text-xs font-semibold text-[#1F5C4E]">
            Sent to {fetcher.data.sentTo}.{' '}
            {fetcher.data.url ? (
              <a href={fetcher.data.url} target="_blank" rel="noreferrer" data-testid="send-link" className="underline">
                See what they see
              </a>
            ) : null}
          </p>
        ) : fetcher.data?.error ? (
          <p className="text-xs text-red-700">{fetcher.data.error}</p>
        ) : null}
      </fetcher.Form>
    </section>
  );
}
