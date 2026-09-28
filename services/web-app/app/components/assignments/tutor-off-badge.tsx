import { Badge } from '~/components/ui/badge';

/**
 * Marks an assignment students wrote without the Yawp tutor — a cold write.
 *
 * Only the off state is badged. The tutor is on by default, so marking every
 * ordinary assignment would be noise; what a teacher scanning a list needs to
 * spot is the deliberate exception, the paper that shows what a student can do
 * unaided.
 */
export function TutorOffBadge({
  tutorEnabled,
  className,
}: {
  tutorEnabled: boolean;
  className?: string;
}) {
  if (tutorEnabled) return null;
  return (
    <Badge
      variant="secondary"
      size="sm"
      className={className}
      title="Students wrote this without the tutor — a cold write."
      data-testid="tutor-off-badge"
    >
      Tutor off
    </Badge>
  );
}
