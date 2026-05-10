import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import type { PlanningState } from './types';

export function PlanningSidebar({
  planning,
  setPlanning,
  disabled = false,
}: {
  planning: PlanningState;
  setPlanning: (p: PlanningState) => void;
  disabled?: boolean;
}) {
  function patch<K extends keyof PlanningState>(key: K, value: PlanningState[K]) {
    setPlanning({ ...planning, [key]: value });
  }

  return (
    <aside className="flex h-full flex-col rounded-lg border bg-background">
      <header className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Planning</h2>
        <p className="text-xs text-muted-foreground">
          Persists across reading and writing.
        </p>
      </header>

      <Tabs defaultValue="outline" className="flex min-h-0 flex-1 flex-col p-2">
        <TabsList className="grid h-9 grid-cols-4">
          <TabsTrigger value="outline" className="text-xs">
            Outline
          </TabsTrigger>
          <TabsTrigger value="thesis" className="text-xs">
            Thesis
          </TabsTrigger>
          <TabsTrigger value="groupings" className="text-xs">
            Groupings
          </TabsTrigger>
          <TabsTrigger value="outside" className="text-xs">
            Outside ev.
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="min-h-0 flex-1">
          <PlannerField
            value={planning.outline}
            onChange={(v) => patch('outline', v)}
            placeholder="Paragraph plan: P1 thesis + context, P2 first grouping, P3 second grouping, P4 counter…"
            disabled={disabled}
          />
        </TabsContent>
        <TabsContent value="thesis" className="min-h-0 flex-1">
          <PlannerField
            value={planning.thesisDraft}
            onChange={(v) => patch('thesisDraft', v)}
            placeholder="Stake a position on extent: which goals achieved, which not, and why."
            disabled={disabled}
          />
        </TabsContent>
        <TabsContent value="groupings" className="min-h-0 flex-1">
          <PlannerField
            value={planning.docGroupings}
            onChange={(v) => patch('docGroupings', v)}
            placeholder="Group A,C → legal achievements; Group D,F,G → reversal; Group B,E → lived experience…"
            disabled={disabled}
          />
        </TabsContent>
        <TabsContent value="outside" className="min-h-0 flex-1">
          <PlannerField
            value={planning.outsideEvidence}
            onChange={(v) => patch('outsideEvidence', v)}
            placeholder="Outside evidence brainstorm: Compromise of 1877, Freedmen's Bureau, Plessy v. Ferguson, sharecropping…"
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function PlannerField({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="h-full min-h-[160px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
    />
  );
}
