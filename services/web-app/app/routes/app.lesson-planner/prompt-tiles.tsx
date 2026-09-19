/**
 * The way into a lesson, as things to pick up rather than a list to read.
 *
 * The planner opened with a column of thin outlined pills under a heading,
 * which is the shape every chat assistant uses and read as one — Brian's note
 * was that it felt like a console. A teacher arriving here is choosing what to
 * make, so the choices are cards: an icon to recognise, the name of the thing,
 * and a line saying what they get.
 *
 * The icons and hints live here rather than beside the prompts themselves. The
 * prompt text is written for the model; this is written for the room.
 */
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  Presentation,
  Repeat,
  SplitSquareHorizontal,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '~/utils/misc';

type TileFace = { icon: LucideIcon; hint: string };

const TILE_FACES: Record<string, TileFace> = {
  'plan-a-lesson': {
    icon: Lightbulb,
    hint: 'Start from nothing. It asks what it needs to know.',
  },
  'plan-a-skill': {
    icon: Target,
    hint: 'Aim at the thing your class keeps getting wrong.',
  },
  'plan-a-standard': {
    icon: ListChecks,
    hint: 'Paste the standard; get a lesson that covers it.',
  },
  'two-personalities': {
    icon: SplitSquareHorizontal,
    hint: 'One objective, two rooms that behave nothing alike.',
  },
  'ground-in-class-data': {
    icon: BarChart3,
    hint: 'Let it read how the class actually scored first.',
  },
  'unit-plan': {
    icon: CalendarDays,
    hint: 'A day-by-day map you build out one day at a time.',
  },
  'slide-deck': {
    icon: Presentation,
    hint: 'Slides with notes you can read while teaching.',
  },
  'get-them-talking': {
    icon: MessagesSquare,
    hint: 'Structures that get a quiet room to say something.',
  },
  'group-work': {
    icon: Users,
    hint: "Roles and accountability, so one kid doesn't carry it.",
  },
  handout: {
    icon: FileText,
    hint: 'A page students hold, with room to write on it.',
  },
  'exit-ticket': {
    icon: ClipboardCheck,
    hint: 'Evidence you can sort in the gap between classes.',
  },
  'extra-practice': {
    icon: Repeat,
    hint: 'Easiest to hardest, with a key for what to look for.',
  },
};

const FALLBACK: TileFace = { icon: Lightbulb, hint: 'Ask the planner for it.' };

export function PromptTiles({
  prompts,
  onPick,
  disabled,
}: {
  prompts: Array<{ id: string; label: string; prompt: string }>;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <ul
      data-testid="prompt-tiles"
      className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {prompts.map((prompt) => {
        const { icon: Icon, hint } = TILE_FACES[prompt.id] ?? FALLBACK;
        return (
          <li key={prompt.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt.prompt)}
              className={cn(
                'group flex h-full w-full flex-col items-start gap-2 rounded-2xl border bg-background p-4 text-left',
                'shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition',
                // The lift is what makes them read as things to pick up rather
                // than rows in a list.
                'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon size={18} />
              </span>
              <span className="text-[15px] font-semibold leading-snug">
                {prompt.label}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {hint}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
