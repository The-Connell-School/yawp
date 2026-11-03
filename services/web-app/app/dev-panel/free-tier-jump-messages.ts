export const PENDING_STATES_NEED_THROWAWAY =
  'Pending states need a throwaway test account.';

export const APPROVED_ADMIN_STATES_NEED_THROWAWAY =
  'Approved and admin jumps need a throwaway test account.';

export const FREE_TIER_JUMP_GENERIC_ERROR = "Couldn't jump to this state.";

const FREE_TIER_JUMP_USER_ERRORS = new Set([
  'Unknown state.',
  PENDING_STATES_NEED_THROWAWAY,
  APPROVED_ADMIN_STATES_NEED_THROWAWAY,
  'State is not implemented yet.',
  'Sign in to jump without a throwaway test account.',
  'Current user is not an active teacher in this org.',
  'Pending fixture jumps require a dev-panel throwaway account.',
  'Could not prepare pending class settings.',
  'Could not prepare pending approval state.',
  'Pending jump produced an unexpected application status.',
  'Could not provision locked preview classroom.',
  FREE_TIER_JUMP_GENERIC_ERROR,
]);

export function formatFreeTierJumpErrorForClient(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (FREE_TIER_JUMP_USER_ERRORS.has(message)) return message;
    if (message.startsWith('Could not prepare pending approval state (')) {
      return message;
    }
  }
  return FREE_TIER_JUMP_GENERIC_ERROR;
}
