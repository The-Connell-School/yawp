import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
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
  afterFirstClassTile,
}: {
  classes: TeacherClassCardData[];
  totalClassCount: number;
  showAssignmentsTab?: boolean;
  /** Rendered immediately after the first class card (e.g. locked getting-started). */
  afterFirstClassTile?: ReactNode;
  firstAssignmentCelebration?: {
    open: boolean;
    preview: FirstAssignmentCelebrationPreview | null;
    onDismiss: () => void;
  };
}) {
  const featuredAssignmentRowRef = useRef<HTMLAnchorElement>(null);
  const celebrationClassId = firstAssignmentCelebration?.preview?.classId;

  return (
    <div data-testid="teacher-classes-grid" data-tour="dashboard-classes">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2>My Classes</h2>
        <div className="flex items-center gap-2">
          {totalClassCount > 0 ? (
            <Badge variant="secondary" size="sm">
              {totalClassCount}
            </Badge>
          ) : null}
          <Link
            to="/app/my-classes"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
      </div>

      {classes.length === 0 && !afterFirstClassTile ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No classes yet. Create one from My Classes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.length === 0 && afterFirstClassTile ? (
            <div className="w-full max-w-[320px]">{afterFirstClassTile}</div>
          ) : null}
          {classes.flatMap((klass, index) => {
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

            const nodes: ReactNode[] = [];

            if (isCelebrationClass) {
              nodes.push(
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
            } else {
              nodes.push(<div key={klass.id}>{card}</div>);
            }

            if (index === 0 && afterFirstClassTile) {
              nodes.push(
                <div key="after-first-class-tile" className="w-full max-w-[320px]">
                  {afterFirstClassTile}
                </div>
              );
            }

            return nodes;
          })}
        </div>
      )}
    </div>
  );
}
