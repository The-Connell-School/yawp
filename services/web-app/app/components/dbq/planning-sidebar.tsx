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
  function patch<K extends keyof PlanningState>(
    key: K,
    value: PlanningState[K]
  ) {
    setPlanning({ ...planning, [key]: value });
  }

  return (
    <div className="flex flex-col">
      <Tabs defaultValue="outline" className="flex flex-col">
        <TabsList className="h-8 self-start">
          <TabsTrigger value="outline" className="text-[11px]">
            Outline
          </TabsTrigger>
          <TabsTrigger value="thesis" className="text-[11px]">
            Thesis
          </TabsTrigger>
          <TabsTrigger value="groupings" className="text-[11px]">
            Groupings
          </TabsTrigger>
          <TabsTrigger value="outside" className="text-[11px]">
            Outside ev.
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outline">
          <PlannerField
            value={planning.outline}
            onChange={(v) => patch('outline', v)}
            placeholder="Paragraph plan: P1 thesis + context, P2 first grouping, P3 second grouping, P4 counter…"
            disabled={disabled}
          />
        </TabsContent>
        <TabsContent value="thesis">
          <PlannerField
            value={planning.thesisDraft}
            onChange={(v) => patch('thesisDraft', v)}
            placeholder="Stake a position on extent: which goals achieved, which not, and why."
            disabled={disabled}
          />
        </TabsContent>
        <TabsContent value="groupings">
          <PlannerField
            value={planning.docGroupings}
            onChange={(v) => patch('docGroupings', v)}
            placeholder="Group A,C → legal achievements; Group D,F,G → reversal; Group B,E → lived experience…"
            disabled={disabled}
          />
        </TabsContent>
        <TabsContent value="outside">
          <PlannerField
            value={planning.outsideEvidence}
            onChange={(v) => patch('outsideEvidence', v)}
            placeholder="Compromise of 1877, Plessy v. Ferguson, sharecropping, Freedmen's Bureau…"
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>
    </div>
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
      className="min-h-[96px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
    />
  );
}
