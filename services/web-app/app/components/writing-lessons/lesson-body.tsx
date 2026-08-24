import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The lesson renderer: the small slice of markdown these lessons are written
 * in — headings, bullets, before/after example rows, a quick tip — turned into
 * the components the lesson page reads with.
 *
 * Shared so the recap panel a student opens mid-practice reads exactly like
 * the lesson it is abridging, rather than a second, plainer rendering of it.
 */

export function LessonBody({ content }: { content: string }) {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <article className="max-w-[68ch] space-y-6">
      {blocks.map((block, index) => (
        <LessonBlock key={index} block={block} />
      ))}
    </article>
  );
}

function LessonBlock({ block }: { block: string }) {
  const lines = block.split('\n').map((line) => line.trim());
  const first = lines[0] ?? '';

  // The top-level "# Title" is already shown in the page header.
  if (first.startsWith('# ') && lines.length === 1) return null;
  if (block === '---') return null;

  // Before/after example blocks become tinted cards.
  if (lines.some((line) => /^-\s*(❌|✅|⚠️)/.test(line))) {
    return <ExampleCard lines={lines} />;
  }

  if (first.startsWith('## ')) {
    const heading = stripInlineMarks(first.slice(3));
    const rest = lines.slice(1).join('\n').trim();
    if (/quick tip/i.test(heading)) {
      return (
        <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1.5">
            <p className="font-semibold text-foreground">{heading}</p>
            <Prose text={rest} />
          </div>
        </div>
      );
    }
    return (
      <section className="space-y-2.5">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          {heading}
        </h3>
        {rest ? <Prose text={rest} /> : null}
      </section>
    );
  }

  if (first.startsWith('### ')) {
    const heading = stripInlineMarks(first.slice(4));
    const rest = lines.slice(1).join('\n').trim();
    return (
      <section className="space-y-2">
        <h4 className="text-base font-semibold text-foreground">{heading}</h4>
        {rest ? <Prose text={rest} /> : null}
      </section>
    );
  }

  return <Prose text={block} />;
}

function ExampleCard({ lines }: { lines: string[] }) {
  const titleLine = lines.find((line) => /^\*\*Example/i.test(line));
  const title = titleLine
    ? stripInlineMarks(titleLine).replace(/:$/, '')
    : 'Example';
  const rows = lines.filter((line) => line.startsWith('- '));

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <ExampleRow key={index} row={row} />
        ))}
      </div>
    </div>
  );
}

function ExampleRow({ row }: { row: string }) {
  const body = row.replace(/^-\s*/, '');

  const whyMatch = body.match(/^\*?Why:\*?\s*(.*)$/i);
  if (whyMatch) {
    return (
      <p className="flex gap-2 pt-1 text-sm text-muted-foreground">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>
          <span className="font-medium text-foreground">Why: </span>
          {renderInline(whyMatch[1])}
        </span>
      </p>
    );
  }

  const emojiMatch = body.match(/^(❌|✅|⚠️)\s*(.*)$/);
  if (emojiMatch) {
    const [, emoji, rest] = emojiMatch;
    const tone =
      emoji === '✅'
        ? 'border-emerald-200 bg-emerald-50'
        : emoji === '❌'
          ? 'border-rose-200 bg-rose-50'
          : 'border-amber-200 bg-amber-50';
    return (
      <div className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
        <span aria-hidden="true">{emoji}</span>
        <p className="leading-relaxed text-foreground">{renderInline(rest)}</p>
      </div>
    );
  }

  return <p className="text-sm leading-relaxed">{renderInline(body)}</p>;
}

function Prose({ text }: { text: string }) {
  const lines = text.split('\n').map((line) => line.trim());
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    nodes.push(
      <ul
        key={`ul-${nodes.length}`}
        className="ml-1 space-y-1.5 border-l-2 border-border pl-4 text-[15px] leading-relaxed text-muted-foreground"
      >
        {items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  };

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    nodes.push(
      <p
        key={`p-${nodes.length}`}
        className="text-[15px] leading-relaxed text-muted-foreground"
      >
        {renderInline(line)}
      </p>
    );
  }
  flushBullets();

  return <div className="space-y-3">{nodes}</div>;
}

/** Renders inline **bold**, *italic*, and `code`, stripping the markers. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 text-[0.85em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function stripInlineMarks(value: string): string {
  return value.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '').trim();
}
