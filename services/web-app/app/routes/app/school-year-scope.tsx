import { CalendarRange } from 'lucide-react';
import { useFetcher } from 'react-router';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select';
import { cn } from '~/utils/misc';
import { ALL_SCHOOL_YEARS } from '~/utils/school-year';

export type SchoolYearScopeData = {
  selected: string;
  options: string[];
};

function fullLabel(scope: string) {
  if (scope === ALL_SCHOOL_YEARS) return 'All years';
  return scope.replace('-', '–');
}

/**
 * The app-wide school year. It lives with the other global settings rather
 * than on a page, because it scopes every teacher surface at once — classes,
 * the grading queue, class pickers — and a control that sat on one page would
 * imply it only applied there.
 */
export function SchoolYearScopeSwitcher({
  scope,
}: {
  scope: SchoolYearScopeData;
}) {
  const fetcher = useFetcher();
  const pending = fetcher.formData?.get('year')?.toString();
  const selected = pending ?? scope.selected;

  return (
    <Select
      value={selected}
      onValueChange={(year) => {
        fetcher.submit({ year }, { method: 'POST', action: '/api/school-year' });
      }}
    >
      <SelectTrigger
        data-testid="school-year-scope"
        aria-label="School year"
        title={`School year: ${fullLabel(selected)}`}
        className={cn(
          'h-9 w-full justify-start gap-2 bg-background px-3 font-medium text-foreground'
        )}
      >
        <CalendarRange className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate text-sm">{fullLabel(selected)}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {scope.options.map((year) => (
          <SelectItem key={year} value={year}>
            {fullLabel(year)}
          </SelectItem>
        ))}
        <SelectItem value={ALL_SCHOOL_YEARS}>All years</SelectItem>
      </SelectContent>
    </Select>
  );
}
