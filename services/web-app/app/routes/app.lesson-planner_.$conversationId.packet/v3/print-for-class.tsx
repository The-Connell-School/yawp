/**
 * Print it for class (Oct 24 handoff, task 4), in place of Take it to class:
 * the lesson plan and the handouts as Word, Google Docs or PDF; the slides to
 * Present, Edit, Rebuild or print; then everything in one packet. Google Docs
 * opens a real Google Doc in the teacher's Drive (task 3).
 */
import { Link } from 'react-router';
import { FileText, MonitorPlay, Printer } from 'lucide-react';
import { DownloadLink } from '~/components/lesson-planner/download-link';
import { ONE_PACKET_CAPTION } from '~/domain/lesson-planner/one-packet';
import { BUTTON, Row } from './take-to-class';
import { HEADING_FONT } from './theme';

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
  /** A deck built but not in the lesson. `editHref` is null without deck v2. */
  builtDeck?: { presentHref: string; editHref: string | null; onStack: boolean; onAdd: () => void } | null;
  children?: React.ReactNode;
}) {
  const base = `/app/lesson-planner/${conversationId}`;
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
            <DownloadLink href={`${base}/slides.pdf`} testId="deck-pdf" className={BUTTON}>
          PDF
        </DownloadLink>
          </>
        ) : (
          <>
            {builtDeck ? (
              <>
                <Link to={builtDeck.presentHref} data-testid="built-deck-present" className={BUTTON}>
                  Present
                </Link>
                {builtDeck.editHref ? (
                  <Link to={builtDeck.editHref} data-testid="built-deck-edit" className={BUTTON}>
                    Edit
                  </Link>
                ) : null}
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
        <DownloadLink href={`${base}/packet.pdf`} testId="one-packet" className="text-sm font-semibold text-[var(--sv-coral)] underline underline-offset-2">
          Get everything in one packet (PDF)
        </DownloadLink>
        <p className="mt-0.5 text-xs text-white/60">{ONE_PACKET_CAPTION}</p>
        <p data-testid="google-docs-caption" className="mt-3 text-xs text-white/60">
          {GOOGLE_DOCS_CAPTION}
        </p>
      </div>
      {children}
    </section>
  );
}
