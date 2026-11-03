import { useRef } from 'react';
import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { useFreeAccountUsage } from '~/components/free-account-usage';
import {
  FirstAssignmentCelebrationAnchor,
  type FirstAssignmentCelebrationPreview,
} from '~/components/free-tier/first-assignment-congratulations-dialog';
import {
  TeacherClassCard,
  type TeacherClassCardData,
} from '~/components/teacher-class-card';

export function ClassesAtAGlance({
  classes,
  totalClassCount,
  showAssignmentsTab = true,
  firstAssignmentCelebration,
}: {
  classes: TeacherClassCardData[];
  totalClassCount: number;
  showAssignmentsTab?: boolean;
  firstAssignmentCelebration?: {
    open: boolean;
    preview: FirstAssignmentCelebrationPreview | null;
    onDismiss: () => void;
  };
}) {
  const freeUsage = useFreeAccountUsage();
  const featuredAssignmentRowRef = useRef<HTMLAnchorElement>(null);
  const celebrationClassId = firstAssignmentCelebration?.preview?.classId;

  return (
    <div data-testid="teacher-classes-grid" data-tour="dashboard-classes">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">My Classes</h2>
        <div className="flex items-center gap-2">
          {!freeUsage && totalClassCount > 0 ? (
            <Badge variant="secondary" size="sm">
              {totalClassCount}
            </Badge>
          ) : null}
          <Link
            to="/app/my-classes"
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No classes yet. Create one from My Classes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((klass) => {
            const isCelebrationClass =
              firstAssignmentCelebration?.open &&
              celebrationClassId === klass.id &&
              firstAssignmentCelebration.preview;
            const card = (
              <TeacherClassCard
                klass={klass}
                showAssignmentsTab={showAssignmentsTab}
                featuredAssignment={
                  isCelebrationClass
                    ? {
                        assignmentId:
                          firstAssignmentCelebration.preview!.assignmentId,
                        title: firstAssignmentCelebration.preview!.title,
                        dueAt: firstAssignmentCelebration.preview!.dueAt,
                      }
                    : undefined
                }
                highlightFeaturedAssignment={Boolean(isCelebrationClass)}
                featuredAssignmentRowRef={
                  isCelebrationClass ? featuredAssignmentRowRef : undefined
                }
                celebrationElevated={Boolean(isCelebrationClass)}
              />
            );

            if (isCelebrationClass) {
              return (
                <FirstAssignmentCelebrationAnchor
                  key={klass.id}
                  open={firstAssignmentCelebration.open}
                  preview={firstAssignmentCelebration.preview}
                  assignmentRowRef={featuredAssignmentRowRef}
                  onDismiss={firstAssignmentCelebration.onDismiss}
                >
                  {card}
                </FirstAssignmentCelebrationAnchor>
              );
            }

            return <div key={klass.id}>{card}</div>;
          })}
        </div>
      )}
    </div>
  );
}
