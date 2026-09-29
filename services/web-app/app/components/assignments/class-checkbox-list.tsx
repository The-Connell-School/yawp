// Multi-select class picker used by the assignment creation sheets.
//
// Teachers routinely teach the same assignment to several sections, so classes
// are checkboxes rather than a single-select dropdown. Nothing is selected by
// default: with multiple targets possible, an implicit default is how an
// assignment quietly lands on the wrong section.
//
// Pass `name` to have the component emit the hidden form inputs itself; the
// create API reads repeated `classIds` values via formData.getAll('classIds').
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';

export type ClassCheckboxOption = {
  id: string;
  label: string;
};

type Props = {
  /** Namespaces the checkbox ids so two sheets can render on one page. */
  idPrefix: string;
  classes: ClassCheckboxOption[];
  selectedIds: string[];
  onToggle: (classId: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
  /** When set, renders a hidden input per selected class under this name. */
  name?: string;
};

export function ClassCheckboxList({
  idPrefix,
  classes,
  selectedIds,
  onToggle,
  disabled = false,
  emptyMessage = "You don't have any assignment-enabled classes yet.",
  name,
}: Props) {
  return (
    <>
      {name
        ? selectedIds.map((id) => (
            <input key={id} type="hidden" name={name} value={id} />
          ))
        : null}
      <div className="space-y-2.5 rounded-md border p-3">
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          classes.map((klass) => {
            const inputId = `${idPrefix}-class-${klass.id}`;

            return (
              <div key={klass.id} className="flex items-center gap-2.5">
                <Checkbox
                  id={inputId}
                  checked={selectedIds.includes(klass.id)}
                  onCheckedChange={() => onToggle(klass.id)}
                  disabled={disabled}
                />
                <Label htmlFor={inputId} className="cursor-pointer font-normal">
                  {klass.label}
                </Label>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
