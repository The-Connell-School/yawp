import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ClassArt } from '~/components/class-art';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

export type ClassHeaderTab = 'students' | 'documents';

export function resolveClassHeaderTab(
  tab: 'students' | 'documents'
): ClassHeaderTab {
  return tab;
}

export type ClassDetailHeaderProps = {
  klass: {
    id: string;
    grade: string | number;
    period: string | number;
    title?: string | null;
    school?: { name: string } | null;
    schoolYear: string;
    code: string;
    classArtIndex: number | null;
  };
  studentCount: number;
  documentCount: number;
  activeTab: ClassHeaderTab;
  onTabChange: (tab: ClassHeaderTab) => void;
  onEdit: () => void;
};

function classTitle(klass: ClassDetailHeaderProps['klass']) {
  return (
    <>
      Grade {klass.grade} • Period {klass.period}
      {klass.title ? ` — ${klass.title}` : ''}
    </>
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
      <Badge variant="outline" size="sm" className="font-mono">
        {klass.code}
      </Badge>
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
      className="relative flex w-full max-w-md items-stretch"
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 bg-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-black/15 transition-[left,width] duration-300 ease-out',
          activeIndex === 0 && 'rounded-bl-xl',
          activeIndex === tabs.length - 1 && 'rounded-br-xl'
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
  ...props
}: ClassDetailHeaderProps) {
  const tabs = useMemo(
    () => [
      { id: 'students' as const, label: 'Students', value: studentCount },
      { id: 'documents' as const, label: 'Documents', value: documentCount },
    ],
    [studentCount, documentCount]
  );

  return (
    <div
      data-testid="class-detail-header"
      className="mb-6 overflow-hidden rounded-xl bg-white ring-1 ring-black/10"
    >
      <div className="flex min-w-0 items-start gap-4 p-4 sm:p-5">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10 sm:size-20">
          <ClassArt
            seed={props.klass.id}
            classArtIndex={props.klass.classArtIndex}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                {classTitle(props.klass)}
              </h1>
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
