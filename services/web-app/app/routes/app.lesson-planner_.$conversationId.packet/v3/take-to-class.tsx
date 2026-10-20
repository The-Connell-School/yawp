/**
 * Take it to class (stack page redesign): the lesson plan, the deck and the
 * handouts, each built from the stack in its order. It carries the same four
 * things as "When the sequence is set" did (Brian's run 3: keep that flow).
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { FileText, MonitorPlay, Printer } from 'lucide-react';
import { HEADING_FONT } from './theme';

function Row({
  icon,
  title,
  line,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/10 py-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3E3C8] text-[#6B4A12]">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/60">{line}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const BUTTON =
  'flex-1 rounded-lg border border-white/20 px-3 py-2 text-center text-sm font-semibold transition hover:bg-white/10';

export function TakeToClass({
  conversationId,
  planExportV2,
  stepCount,
  handoutCount,
  deck,
  deckV2,
  children,
}: {
  conversationId: string;
  planExportV2: boolean;
  stepCount: number;
  handoutCount: number;
  deck: { id: string; slides: number; title: string } | null;
  deckV2: boolean;
  /** Post to your class sits inside, when sharing is on. */
  children?: React.ReactNode;
}) {
  const [googleSteps, setGoogleSteps] = useState(false);
  const base = `/app/lesson-planner/${conversationId}`;
  const docx = `${base}/plan.docx`;
  return (
    <section
      data-testid="take-to-class"
      className="rounded-2xl bg-[var(--sv-dark)] p-5 text-white"
    >
      <h2 className="text-xl font-bold text-white" style={HEADING_FONT}>
        Take it to class
      </h2>
      <p className="mb-4 text-xs text-white/60">Everything below follows the order on the left.</p>

      <Row icon={<FileText size={16} />} title="Lesson plan" line="Timed, one page, ready to file">
        {planExportV2 ? (
          <>
            <a href={docx} download data-testid="plan-word" className={`${BUTTON} border-[var(--sv-coral)] bg-[var(--sv-coral)] text-[var(--sv-ink)] hover:bg-[var(--sv-coral)]`}>
              Word
            </a>
            <button
              type="button"
              data-testid="plan-google"
              className={BUTTON}
              onClick={() => {
                setGoogleSteps(true);
                const link = document.createElement('a');
                link.href = docx;
                link.download = '';
                link.click();
                window.open('https://docs.google.com/document/u/0/', '_blank', 'noopener');
              }}
            >
              Google Docs
            </button>
            <a href={`${base}/plan.pdf`} download data-testid="plan-pdf-v3" className={BUTTON}>
              PDF
            </a>
          </>
        ) : (
          <a href={`${base}/packet.pdf`} download className={BUTTON}>
            Download the plan (PDF)
          </a>
        )}
      </Row>
      {googleSteps ? (
        <ol data-testid="google-docs-steps" className="-mt-2 mb-3 list-decimal space-y-0.5 pl-5 text-xs text-white/70">
          <li>The Word file is downloading, and Google Docs opened in a new tab.</li>
          <li>In Google Docs, choose File, then Open, then Upload.</li>
          <li>Pick the lesson plan. It opens as a Google Doc you can edit.</li>
        </ol>
      ) : null}

      <Row
        icon={<MonitorPlay size={16} />}
        title="Slide deck"
        line={deck ? `${deck.slides} slides from your stack` : `About one slide per step (${stepCount} steps)`}
      >
        {deck ? (
          <>
            <Link to={`/present/${conversationId}/${deck.id}`} data-testid="deck-present" className={BUTTON}>
              Present
            </Link>
            {deckV2 ? (
              <Link to={`${base}/deck/${deck.id}?from=stack`} className={BUTTON}>
                Edit
              </Link>
            ) : null}
            <Link to={`/app/lesson-planner?c=${conversationId}&build=rebuild-deck`} className={BUTTON}>
              Rebuild
            </Link>
          </>
        ) : (
          <Link to={`/app/lesson-planner?c=${conversationId}&build=deck`} data-testid="build-deck" className={BUTTON}>
            Build the deck
          </Link>
        )}
      </Row>

      <Row
        icon={<Printer size={16} />}
        title="Student handouts"
        line={
          handoutCount
            ? `${handoutCount} ${handoutCount === 1 ? 'page' : 'pages'} from the steps marked with a handout`
            : 'Choose which steps go in'
        }
      >
        <Link to={`${base}/handouts`} data-testid="handouts-print" className={BUTTON}>
          Print
        </Link>
        <a href={`${base}/packet.pdf?view=handout`} download className={BUTTON}>
          PDF
        </a>
      </Row>
      <a href={`${base}/packet.pdf`} download className="mt-1 block text-xs font-semibold text-[var(--sv-coral)] underline underline-offset-2">
        Or get everything in one packet (PDF)
      </a>
      {children}
    </section>
  );
}
