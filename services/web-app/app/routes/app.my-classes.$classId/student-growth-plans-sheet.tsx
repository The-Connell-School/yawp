import { ChevronRight } from 'lucide-react';
import { Badge, badgeVariants } from '~/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import {
  StudentPasteAlertsSection,
  type StudentPasteAlert,
} from './student-paste-alerts-section';

export type StudentGrowthPlan = {
  id: string;
  focus: string;
  targetSkills: string[];
  body: string;
  checkInAt: string | Date | null;
  status: string;
  createdAt: string | Date;
};

export type GrowthPlanSheetStudent = {
  id: string;
  name: string;
  email: string;
};

function formatDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function GrowthPlanCard({ plan }: { plan: StudentGrowthPlan }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-foreground">{plan.focus}</h3>
        <Badge
          variant={plan.status === 'active' ? 'success' : 'outline'}
          size="sm"
          className="shrink-0 capitalize"
        >
          {plan.status}
        </Badge>
      </div>

      {plan.targetSkills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {plan.targetSkills.map((skill) => (
            <Badge key={skill} variant="info-soft" size="sm" className="capitalize">
              {skill.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      ) : null}

      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
        {plan.body}
      </p>

      {plan.checkInAt ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Check in by {formatDate(plan.checkInAt)}
        </p>
      ) : null}
    </div>
  );
}

export type StudentGrowthPlansSheetContentProps = {
  student: GrowthPlanSheetStudent | null;
  growthPlans: StudentGrowthPlan[];
  onViewDocuments: () => void;
  /** Empty when the student has no paste activity — the section renders nothing. */
  pasteAlerts?: StudentPasteAlert[];
  /** exitTo target for paste-alert document links, back to the class page. */
  pasteAlertsExitTo?: string;
  /** Set false when growth plans aren't shown for this student (e.g. Reporter disabled). */
  showGrowthPlans?: boolean;
  /**
   * Set false to render the header as plain markup instead of Radix
   * SheetHeader/SheetTitle, which require a Dialog context. Lets tests
   * render this content directly without the Sheet portal.
   */
  renderSheet?: boolean;
};

/**
 * The sheet body, split out from the `<Sheet>`/`<SheetContent>` Radix
 * wrapper so it can be rendered and asserted on directly in tests without
 * depending on the portal.
 */
export function StudentGrowthPlansSheetContent({
  student,
  growthPlans,
  onViewDocuments,
  pasteAlerts = [],
  pasteAlertsExitTo = '',
  showGrowthPlans = true,
  renderSheet = true,
}: StudentGrowthPlansSheetContentProps) {
  const header = renderSheet ? (
    <SheetHeader>
      <SheetTitle>{student?.name ?? 'Student'}</SheetTitle>
      {showGrowthPlans ? (
        <SheetDescription>Growth plans from Reporter</SheetDescription>
      ) : null}
    </SheetHeader>
  ) : (
    <div>
      <h2>{student?.name ?? 'Student'}</h2>
      {showGrowthPlans ? <p>Growth plans from Reporter</p> : null}
    </div>
  );

  return (
    <>
      {header}

      {student ? (
        <button
          type="button"
          className={cn(
            badgeVariants({ variant: 'secondary' }),
            'mt-4 cursor-pointer gap-1 py-1 pl-2 pr-1'
          )}
          onClick={onViewDocuments}
          aria-label={`View ${student.name}'s documents`}
        >
          Docs
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        </button>
      ) : null}

      <StudentPasteAlertsSection alerts={pasteAlerts} exitTo={pasteAlertsExitTo} />

      {showGrowthPlans ? (
        <div className="mt-4 space-y-3 pb-6">
          {growthPlans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No growth plans yet for this student.
              </p>
            </div>
          ) : (
            growthPlans.map((plan) => <GrowthPlanCard key={plan.id} plan={plan} />)
          )}
        </div>
      ) : null}
    </>
  );
}

export function StudentGrowthPlansSheet({
  open,
  onOpenChange,
  student,
  growthPlans,
  onViewDocuments,
  pasteAlerts = [],
  pasteAlertsExitTo = '',
  showGrowthPlans = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: GrowthPlanSheetStudent | null;
  growthPlans: StudentGrowthPlan[];
  onViewDocuments: () => void;
  pasteAlerts?: StudentPasteAlert[];
  pasteAlertsExitTo?: string;
  showGrowthPlans?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <StudentGrowthPlansSheetContent
          student={student}
          growthPlans={growthPlans}
          onViewDocuments={onViewDocuments}
          pasteAlerts={pasteAlerts}
          pasteAlertsExitTo={pasteAlertsExitTo}
          showGrowthPlans={showGrowthPlans}
        />
      </SheetContent>
    </Sheet>
  );
}
