/**
 * The pattern a cold write exists to find, drawn as an illustration: tutor-off
 * scores rising toward tutor-on scores over a year, so the gap between them
 * narrows. The numbers are made up to show the shape and are labeled that way;
 * they come from the sketch in the transfer research brief, not from students.
 *
 * Colors were checked for color-blind separation and contrast against both
 * themes. Each series also has its own line style and a direct label, so
 * identity never rests on color alone.
 */

const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];

const WARM = [
  { month: 1, score: 78 },
  { month: 2, score: 79 },
  { month: 3, score: 81 },
  { month: 5, score: 84 },
  { month: 6, score: 85 },
  { month: 7, score: 86 },
];

const COLD = [
  { month: 0, score: 62, label: 'September diagnostic' },
  { month: 4, score: 71, label: 'January diagnostic' },
  { month: 8, score: 80, label: 'May diagnostic' },
];

const W = 520;
const H = 250;
const PAD = { top: 14, right: 104, bottom: 30, left: 34 };
const Y_MIN = 56;
const Y_MAX = 92;
const Y_TICKS = [60, 70, 80, 90];

const x = (month: number) =>
  PAD.left + (month / (MONTHS.length - 1)) * (W - PAD.left - PAD.right);
const y = (score: number) =>
  PAD.top + ((Y_MAX - score) / (Y_MAX - Y_MIN)) * (H - PAD.top - PAD.bottom);

const path = (points: { month: number; score: number }[]) =>
  points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.month)},${y(p.score)}`)
    .join(' ');

const WARM_STROKE = 'stroke-[#c4532f] dark:stroke-[#d46a45]';
const WARM_FILL = 'fill-[#c4532f] dark:fill-[#d46a45]';
const COLD_STROKE = 'stroke-[#0b78a8] dark:stroke-[#3a9fd0]';
const COLD_FILL = 'fill-[#0b78a8] dark:fill-[#3a9fd0]';

function Gap({
  month,
  from,
  to,
  side,
}: {
  month: number;
  from: number;
  to: number;
  side: 'left' | 'right';
}) {
  return (
    <g>
      <line
        x1={x(month)}
        x2={x(month)}
        y1={y(to) + 6}
        y2={y(from) - 6}
        className="stroke-muted-foreground/60"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <text
        x={x(month) + (side === 'right' ? 6 : -6)}
        y={(y(from) + y(to)) / 2 + 4}
        textAnchor={side === 'right' ? 'start' : 'end'}
        className="fill-muted-foreground text-[12px]"
      >
        {to - from}-point gap
      </text>
    </g>
  );
}

export function TransferChart() {
  return (
    <figure className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">
          One student over a school year
        </p>
        <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Illustration
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="10" aria-hidden="true">
            <line
              x1="0"
              x2="18"
              y1="5"
              y2="5"
              strokeWidth="2"
              className={WARM_STROKE}
            />
          </svg>
          Warm writes, Tutor on
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="10" aria-hidden="true">
            <line
              x1="0"
              x2="18"
              y1="5"
              y2="5"
              strokeWidth="2"
              strokeDasharray="4 3"
              className={COLD_STROKE}
            />
            <circle cx="9" cy="5" r="4" className={COLD_FILL} />
          </svg>
          Cold writes, Tutor off
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Illustration: a student's cold-write scores rise from 62 in September to 71 in January, then to 80 in May, while warm-write scores rise more slowly from 78 to 86. The gap between them narrows from 16 points to 6."
      >
        {Y_TICKS.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[12px] tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}
        {MONTHS.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[12px]"
          >
            {m}
          </text>
        ))}

        <Gap month={0.5} from={62} to={78} side="right" />
        <Gap month={7.5} from={80} to={86} side="left" />

        <path
          d={path(WARM)}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          className={WARM_STROKE}
        />
        {WARM.map((p) => (
          <circle
            key={p.month}
            cx={x(p.month)}
            cy={y(p.score)}
            r={4}
            strokeWidth={2}
            className={`${WARM_FILL} stroke-background`}
          >
            <title>{`${MONTHS[p.month]} warm write: ${p.score}`}</title>
          </circle>
        ))}

        <path
          d={path(COLD)}
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 4"
          className={COLD_STROKE}
        />
        {COLD.map((p) => (
          <circle
            key={p.month}
            cx={x(p.month)}
            cy={y(p.score)}
            r={6}
            strokeWidth={2}
            className={`${COLD_FILL} stroke-background`}
          >
            <title>{`${p.label} (cold write): ${p.score}`}</title>
          </circle>
        ))}

        <text
          x={x(8) + 12}
          y={y(86) + 4}
          className="fill-foreground text-[13px] font-medium"
        >
          Warm writes
        </text>
        <text
          x={x(8) + 12}
          y={y(80) + 4}
          className="fill-foreground text-[13px] font-medium"
        >
          Cold writes
        </text>
      </svg>

      <figcaption className="text-sm text-muted-foreground">
        These numbers are made up to show the shape. They aren’t student data.
      </figcaption>
    </figure>
  );
}
