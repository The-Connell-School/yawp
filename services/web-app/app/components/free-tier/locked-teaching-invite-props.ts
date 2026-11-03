import {
  TEACHING_ACCESS_LOCKED_TOOLTIP,
  teachingAccessMobileSheetBodyInvite,
} from '~/domain/free-tier/teaching-access-copy';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';

export function useLockedTeachingInviteControlProps() {
  const { state: teachingAccessState } = useTeachingAccess();
  const adminName =
    teachingAccessState.variant === 'locked'
      ? teachingAccessState.adminName
      : 'your administrator';
  return {
    locked: true as const,
    adminName,
    mobileSheetBody: teachingAccessMobileSheetBodyInvite(adminName),
    tooltip: TEACHING_ACCESS_LOCKED_TOOLTIP,
  };
}
