import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, Copy } from 'lucide-react';
import { ClassArt } from '~/components/class-art';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import {
  getClassCardHeading,
} from '~/utils/class-display';
import { cn } from '~/utils/misc';

export type ClassHeaderTab = 'students' | 'documents' | 'assignments';

export function resolveClassHeaderTab(
  tab: 'students' | 'documents' | 'assignments'
): ClassHeaderTab {
  return tab;
}

export type ClassDetailHeaderProps = {
  klass: {
    id: string;
    grade: string | number | null;
    period: string | number | null;
    title?: string | null;
    school?: { name: string } | null;
    schoolYear: string;
    code: string;
    classArtKey: string | null;
    legacyClassArtIndex?: number | null;
  };
  studentCount: number;
  documentCount: number;
  /** Number of assignments in this class. */
  assignmentCount?: number;
  /** Gated on the organization's classInsightsEnabled flag. */
  showAssignmentsTab?: boolean;
  activeTab: ClassHeaderTab;
  onTabChange: (tab: ClassHeaderTab) => void;
  onEdit: () => void;
};

function ClassCodeReveal({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the code stays selectable on screen.
    }
  }, [code]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="class-code-trigger"
          title="Show class code full screen"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Badge
            variant="outline"
            size="sm"
            className="font-mono hover:bg-secondary"
          >
            {code}
          </Badge>
          <span className="sr-only">Show class code full screen</span>
        </button>
      </DialogTrigger>
      {/*
        This gets projected to a class, so nothing behind it may show through:
        the panel fills the viewport and is opaque. Only the eyebrow, the code,
        the copy button and the close button are on screen.
      */}
      <DialogContent
        data-testid="class-code-panel"
        className={cn(
          // inset-0 with auto width/height pins all four edges to the
          // viewport; a fixed 100vw/100dvh would miss by the scrollbar width.
          'inset-0 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-10 rounded-none border-0 bg-background p-10 text-center sm:rounded-none',
          // The shared dialog zooms and slides in from the centre. A panel
          // that covers the screen must not do either — while it travelled it
          // would leave the page showing around its edges.
          '!animate-none',
          // The close button is the only way out of a full-screen panel, so
          // size it to be findable from across a classroom.
          '[&>button:last-child]:right-6 [&>button:last-child]:top-6 [&>button:last-child>svg]:h-7 [&>button:last-child>svg]:w-7'
        )}
      >
        <DialogTitle className="text-lg font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Class code
        </DialogTitle>
        <DialogDescription className="sr-only">
          Share this code with students so they can join the class.
        </DialogDescription>
        {/*
          Sized from the code's own length so it always lands on one line and
          fills the screen: monospace glyphs plus the tracking run about
          0.75em wide, so 110/length vw keeps it inside the viewport.
        */}
        <div
          data-testid="class-code-display"
          className="select-all whitespace-nowrap font-mono font-bold leading-none tracking-[0.15em]"
          style={{
            fontSize: `min(22vh, ${(110 / Math.max(code.length, 1)).toFixed(2)}vw)`,
          }}
        >
          {code}
        </div>
        <Button type="button" variant="outline" size="lg" onClick={handleCopy}>
          {copied ? (
            <Check className="mr-2 h-4 w-4 text-green-600" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ClassMetadata({
  klass,
  className,
}: {
  klass: ClassDetailHeaderProps['klass'];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 text-base/6 text-muted-foreground sm:text-sm/5',
        className
      )}
    >
      {klass.school?.name ? <span>{klass.school.name}</span> : null}
      <span>{klass.schoolYear}</span>
      <ClassCodeReveal code={klass.code} />
    </div>
  );
}

function EditClassButton({ onEdit }: { onEdit: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      onClick={onEdit}
      className="shrink-0"
    >
      Edit Class
    </Button>
  );
}

type HeaderTabConfig = {
  id: ClassHeaderTab;
  label: string;
  value: number;
};

function ClassHeaderTabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: HeaderTabConfig[];
  activeTab: ClassHeaderTab;
  onTabChange: (tab: ClassHeaderTab) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const activeEl = list.querySelector<HTMLElement>(
      `[data-header-tab="${activeTab}"]`
    );
    if (!activeEl) return;

    const listRect = list.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    setIndicator({
      left: activeRect.left - listRect.left,
      width: activeRect.width,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const observer = new ResizeObserver(updateIndicator);
    observer.observe(list);
    return () => observer.disconnect();
  }, [updateIndicator]);

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Class sections"
      className="relative flex w-full max-w-lg items-stretch"
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 bg-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-black/15 transition-[left,width] duration-300 ease-out',
          activeIndex === 0 && 'rounded-bl-xl'
        )}
        style={{ left: indicator.left, width: indicator.width }}
        aria-hidden
      />
      {tabs.map((tab, index) => (
        <Fragment key={tab.id}>
          {index > 0 ? (
            <div
              className="w-px shrink-0 self-stretch bg-border/60"
              aria-hidden
            />
          ) : null}
          <button
            type="button"
            data-header-tab={tab.id}
            role="tab"
            data-state={activeTab === tab.id ? 'active' : 'inactive'}
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative min-w-0 flex-1 px-5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              index === tabs.length - 1 && 'border-r border-border/60',
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="truncate text-base/6 sm:text-sm/5">{tab.label}</div>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-xl">
              {tab.value}
            </div>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function ClassDetailHeader({
  activeTab,
  onTabChange,
  studentCount,
  documentCount,
  assignmentCount = 0,
  showAssignmentsTab = false,
  ...props
}: ClassDetailHeaderProps) {
  const tabs = useMemo(() => {
    const base: HeaderTabConfig[] = [
      { id: 'students' as const, label: 'Students', value: studentCount },
      { id: 'documents' as const, label: 'Documents', value: documentCount },
    ];
    if (showAssignmentsTab) {
      base.push({
        id: 'assignments' as const,
        label: 'Assignments',
        value: assignmentCount,
      });
    }
    return base;
  }, [studentCount, documentCount, assignmentCount, showAssignmentsTab]);
  const { title, subtitle } = getClassCardHeading(props.klass);

  return (
    <div
      data-testid="class-detail-header"
      className="mb-6 overflow-hidden rounded-xl bg-white ring-1 ring-black/10"
    >
      <div className="flex min-w-0 items-start gap-4 p-4 sm:p-5">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10 sm:size-20">
          <ClassArt
            seed={props.klass.id}
            classArtKey={props.klass.classArtKey}
            legacyClassArtIndex={props.klass.legacyClassArtIndex ?? null}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 text-base/6 text-muted-foreground sm:text-sm/5">
                  {subtitle}
                </p>
              ) : null}
              <ClassMetadata klass={props.klass} className="mt-1" />
            </div>
            <EditClassButton onEdit={props.onEdit} />
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 bg-white">
        <ClassHeaderTabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      </div>
    </div>
  );
}
