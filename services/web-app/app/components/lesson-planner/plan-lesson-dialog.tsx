/**
 * Plan a lesson (Oct 24 handoff, Part 2, L3): where will it live? In a unit
 * (a new one included), on its own, or decide when it is set. It can move
 * any time.
 */
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';

export type PlanUnit = { id: string; title: string; course: string; dayCount: number; lastTitle: string | null };

const NEW_UNIT = '__new';

export function placeLine(unit: PlanUnit | null): string | null {
  if (!unit) return null;
  return unit.dayCount ? `It becomes Day ${unit.dayCount + 1}, after “${unit.lastTitle ?? `Day ${unit.dayCount}`}.”` : 'It becomes Day 1.';
}

export function PlanLessonDialog({
  open,
  onOpenChange,
  units,
  defaultUnitId = null,
  busy = false,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: PlanUnit[];
  defaultUnitId?: string | null;
  busy?: boolean;
  onStart: (choice: { unitId: string | null; newUnitTitle: string | null }) => void;
}) {
  const [where, setWhere] = useState<'unit' | 'own' | 'later'>(defaultUnitId || units.length ? 'unit' : 'own');
  const [unitId, setUnitId] = useState<string>(defaultUnitId ?? units[0]?.id ?? NEW_UNIT);
  const [newTitle, setNewTitle] = useState('');
  const unit = units.find((candidate) => candidate.id === unitId) ?? null;
  const ready = where !== 'unit' || (unitId === NEW_UNIT ? newTitle.trim() !== '' : Boolean(unit));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="plan-lesson-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan a new lesson</DialogTitle>
          <DialogDescription>Pick where it lives now, or decide later. You can move it any time.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={where} onValueChange={(value) => setWhere(value as typeof where)} className="gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="unit" id="plan-in-unit" data-testid="plan-in-unit" />
              <Label htmlFor="plan-in-unit">In a unit</Label>
            </div>
            {where === 'unit' ? (
              <div className="mt-3 space-y-2 pl-6">
                <select
                  aria-label="Unit"
                  data-testid="plan-unit"
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {[...new Set(units.map((candidate) => candidate.course))].map((course) => (
                    <optgroup key={course} label={course}>
                      {units
                        .filter((candidate) => candidate.course === course)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                  <option value={NEW_UNIT}>New unit…</option>
                </select>
                {unitId === NEW_UNIT ? (
                  <Input
                    aria-label="New unit name"
                    data-testid="plan-new-unit"
                    placeholder="Unit name"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                  />
                ) : null}
                <p data-testid="plan-place" className="text-xs text-muted-foreground">
                  {unitId === NEW_UNIT ? 'It becomes Day 1.' : placeLine(unit)}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <RadioGroupItem value="own" id="plan-own" data-testid="plan-own" />
            <Label htmlFor="plan-own">On its own</Label>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <RadioGroupItem value="later" id="plan-later" data-testid="plan-later" />
            <Label htmlFor="plan-later">Decide when I set it</Label>
          </div>
        </RadioGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="plan-start"
            disabled={!ready || busy}
            onClick={() =>
              onStart(
                where !== 'unit'
                  ? { unitId: null, newUnitTitle: null }
                  : unitId === NEW_UNIT
                    ? { unitId: null, newUnitTitle: newTitle.trim() }
                    : { unitId, newUnitTitle: null }
              )
            }
          >
            Start planning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
