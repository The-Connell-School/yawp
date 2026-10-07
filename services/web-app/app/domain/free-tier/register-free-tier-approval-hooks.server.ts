import { setApprovalHooks } from '~/domain/free-tier/approval-hooks.server';
import { provisionFreeClassroomFromApproval } from '~/domain/free-tier/provision-free-classroom.server';

setApprovalHooks({
  onApplicationApproved: async (application) => {
    await provisionFreeClassroomFromApproval(application.id);
  },
});
