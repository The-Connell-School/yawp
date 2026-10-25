/**
 * Print it for class (Oct 24 handoff, task 4), in place of Take it to class:
 * the lesson plan and the handouts as Word, Google Docs or PDF; the slides to
 * Present, Edit, Rebuild or print; then Print a packet for class, which puts
 * the parts the teacher checks into one PDF (Brian's round 4, item 5). Google
 * Docs opens a real Google Doc in the teacher's Drive (task 3).
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { FileText, MonitorPlay, Printer } from 'lucide-react';
import { DownloadLink } from '~/components/lesson-planner/download-link';
import { ONE_PACKET_CAPTION, PACKET_PARTS, type PacketPart, type SlidesPerPage } from '~/domain/lesson-planner/one-packet';
import { cn } from '~/utils/misc';
import { BUTTON, Row } from './take-to-class';
import { HEADING_FONT } from './theme';

const PACKET_LABELS: Record<PacketPart, { label: string; hint: string }> = {
  plan: { label: 'Lesson plan', hint: 'Timed, with your notes' },
  slides: { label: 'Slide deck', hint: 'Off by default: slides take up the most pages' },
  handouts: { label: 'Student handouts', hint: 'One page per handout' },
};

/** Packet links and the slides PDF carry the choices (`?parts`, `?perPage`). */
export function packetHref(base: string, parts: PacketPart[], perPage: SlidesPerPage): string {
  const query = new URLSearchParams({ parts: parts.join(','), perPage: String(perPage) });
  return `${base}/packet.pdf?${query}`;
}

/** Slides per page: 2 / 4. Four is a 2×2 grid on each sheet. */
function PerPage({ value, onChange, testId }: { value: SlidesPerPage; onChange: (value: SlidesPerPage) => void; testId: string }) {
  return (
    <span role="group" aria-label="Slides per page" data-testid={testId} className="inline-flex items-center gap-1 text-xs">
      <span className="mr-1">Slides per page:</span>
      {([2, 4] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-md border px-2 py-0.5 font-semibold tabular-nums',
            value === option ? 'border-current' : 'border-transparent opacity-60 hover:opacity-100'
          )}
        >
          {option}
        </button>
      ))}
    </span>
  );
}

export const GOOGLE_DOCS_CAPTION =
  'Google Docs opens a new Doc in your Google Drive. The first time, Google asks you to allow it.';

const PRIMARY = `${BUTTON} border-[var(--sv-coral)] bg-[var(--sv-coral)] text-[var(--sv-ink)] hover:bg-[var(--sv-coral)]`;

export function PrintForClass({
  conversationId,
  handoutCount,
  deck,
  onBuildDeck,
  builtDeck = null,
  children,
}: {
  conversationId: string;
  handoutCount: number;
  deck: { id: string; slides: number } | null;
  onBuildDeck: () => void;
  builtDeck?: { presentHref: string; onStack: boolean; onAdd: () => void } | null;
  children?: React.ReactNode;
}) {
  const base = `/app/lesson-planner/${conversationId}`;
  const [perPage, setPerPage] = useState<SlidesPerPage>(4);
  const [packetOpen, setPacketOpen] = useState(false);
  const [parts, setParts] = useState<Set<PacketPart>>(() => new Set<PacketPart>(['plan', 'handouts']));
  const hasSlides = Boolean(deck || builtDeck);
  const chosen = PACKET_PARTS.filter((part) => parts.has(part) && (part !== 'slides' || hasSlides));
  return (
    <section data-testid="print-for-class" className="rounded-2xl bg-[var(--sv-dark)] p-5 text-white">
      <h2 className="text-xl font-bold text-white" style={HEADING_FONT}>
        Print it for class
      </h2>
      <p className="mb-4 text-xs text-white/60">Everything below follows the order on the left.</p>

      <Row icon={<FileText size={16} />} title="Lesson plan" line="Timed, one page, ready to file">
        <DownloadLink href={`${base}/plan.docx`} testId="plan-word" className={PRIMARY}>
          Word
        </DownloadLink>
        <a href={`${base}/google-doc?doc=plan`} target="_blank" rel="noopener" data-testid="plan-google" className={BUTTON}>
          Google Docs
        </a>
        <DownloadLink href={`${base}/plan.pdf`} testId="plan-pdf-v3" className={BUTTON}>
          PDF
        </DownloadLink>
      </Row>

      <Row
        icon={<MonitorPlay size={16} />}
        title="Slide deck"
        line={
          deck
            ? `${deck.slides} ${deck.slides === 1 ? 'slide' : 'slides'} from your stack`
            : builtDeck
              ? builtDeck.onStack
                ? 'You built a deck here. It isn’t in the lesson yet'
                : 'The planner already made a deck in your conversation'
              : 'No deck yet'
        }
      >
        {deck ? (
          <>
            <Link to={`/present/${conversationId}/${deck.id}?from=stack`} data-testid="deck-present" className={BUTTON}>
              Present
            </Link>
            <Link to={`${base}/deck/${deck.id}?from=stack`} data-testid="deck-edit" className={BUTTON}>
              Edit
            </Link>
            <button type="button" onClick={onBuildDeck} data-testid="rebuild-deck" className={BUTTON}>
              Rebuild
            </button>
            <DownloadLink href={`${base}/slides.pdf?perPage=${perPage}`} testId="deck-pdf" className={BUTTON}>
              PDF
            </DownloadLink>
            <PerPage value={perPage} onChange={setPerPage} testId="deck-per-page" />
          </>
        ) : (
          <>
            {builtDeck ? (
              <>
                <Link to={builtDeck.presentHref} data-testid="built-deck-present" className={BUTTON}>
                  Present
                </Link>
                <button type="button" onClick={builtDeck.onAdd} data-testid="add-conversation-deck" className={BUTTON}>
                  Add it
                </button>
              </>
            ) : null}
            <button type="button" onClick={onBuildDeck} data-testid="build-deck" className={BUTTON}>
              {builtDeck ? 'Build a new one' : 'Build the deck'}
            </button>
          </>
        )}
      </Row>

      <Row
        icon={<Printer size={16} />}
        title="Student handouts"
        line={
          handoutCount
            ? `${handoutCount} ${handoutCount === 1 ? 'page' : 'pages'} from the steps with a handout`
            : 'No steps with a handout yet'
        }
      >
        <DownloadLink href={`${base}/handouts.docx`} testId="handouts-word" className={PRIMARY}>
          Word
        </DownloadLink>
        <a href={`${base}/google-doc?doc=handouts`} target="_blank" rel="noopener" data-testid="handouts-google" className={BUTTON}>
          Google Docs
        </a>
        <DownloadLink href={`${base}/handouts.pdf`} testId="handouts-pdf" className={BUTTON}>
          PDF
        </DownloadLink>
      </Row>

      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          data-testid="one-packet"
          aria-expanded={packetOpen}
          onClick={() => setPacketOpen((open) => !open)}
          className={cn(PRIMARY, 'inline-flex w-full items-center justify-center gap-2')}
        >
          <Printer size={15} /> Print a packet for class
        </button>
        {packetOpen ? (
          // The same checklist as "What they get" in Send this lesson.
          <div data-testid="packet-checklist" className="mt-3 rounded-xl bg-[var(--sv-card)] p-4 text-[var(--sv-ink)]">
            <p className="text-xs font-semibold">What goes in</p>
            <ul className="mt-1 space-y-1.5">
              {PACKET_PARTS.map((part) => {
                const unavailable = part === 'slides' && !hasSlides;
                return (
                  <li key={part}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid={`packet-part-${part}`}
                        disabled={unavailable}
                        checked={parts.has(part) && !unavailable}
                        onChange={() => {
                          const next = new Set(parts);
                          if (next.has(part)) next.delete(part);
                          else next.add(part);
                          setParts(next);
                        }}
                        className="mt-0.5 h-4 w-4 accent-[var(--sv-primary)]"
                      />
                      <span>
                        {PACKET_LABELS[part].label}
                        <span className="block text-xs text-[var(--sv-muted)]">
                          {unavailable ? 'No deck yet' : PACKET_LABELS[part].hint}
                        </span>
                      </span>
                    </label>
                    {part === 'slides' && parts.has('slides') && !unavailable ? (
                      <div className="ml-6 mt-1">
                        <PerPage value={perPage} onChange={setPerPage} testId="packet-per-page" />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-[var(--sv-muted)]">{ONE_PACKET_CAPTION}</p>
            {chosen.length ? (
              // Full width: the link sits in DownloadLink's own inline wrapper.
              <div className="mt-3 [&>span]:flex">
                <DownloadLink
                  href={packetHref(base, chosen, perPage)}
                  testId="packet-print"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sv-primary)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Print the packet (PDF)
                </DownloadLink>
              </div>
            ) : (
              <p data-testid="packet-empty" className="mt-3 text-xs text-[var(--sv-muted)]">
                Check at least one part to print.
              </p>
            )}
          </div>
        ) : null}
        <p data-testid="google-docs-caption" className="mt-3 text-xs text-white/60">
          {GOOGLE_DOCS_CAPTION}
        </p>
      </div>
      {children}
    </section>
  );
}
