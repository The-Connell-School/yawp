/**
 * Inventory of promotion/merge paths for eventual enforcement planning.
 * PREPARE-ONLY — no permissions changed in this prototype.
 */
export type DeliveryRoute = {
  id: string;
  action: string;
  typicalPrincipal: string;
  requiredChecksApply: boolean;
  notes: string;
};

export const YAWP_DELIVERY_ROUTES: DeliveryRoute[] = [
  {
    id: 'github_pr_merge',
    action: 'Merge PR to main via GitHub UI or API',
    typicalPrincipal: 'human maintainer PAT / GitHub App with contents:write',
    requiredChecksApply: true,
    notes: 'merge_group / required checks gate this path only when used.',
  },
  {
    id: 'github_merge_queue',
    action: 'Merge queue batch merge after checks',
    typicalPrincipal: 'GitHub merge queue bot',
    requiredChecksApply: true,
    notes: 'Green merge_group can become stale if hold is placed afterward (see tests).',
  },
  {
    id: 'github_bypass',
    action: 'Admin bypass / direct push to main',
    typicalPrincipal: 'org admin, bypass allowance, or scoped PAT',
    requiredChecksApply: false,
    notes: 'Cannot be closed by status checks alone; needs branch protection + credential boundary.',
  },
  {
    id: 'deploy_workflow_push_main',
    action: 'Deploy workflow on push to main (.github/workflows/deploy.yml)',
    typicalPrincipal: 'GitHub Actions GITHUB_TOKEN + AWS keys in secrets',
    requiredChecksApply: false,
    notes: 'Runs after merge; promotion grant must bind commit SHA + image digest at deploy time.',
  },
  {
    id: 'deploy_workflow_dispatch',
    action: 'Manual workflow_dispatch deploy',
    typicalPrincipal: 'Actor with actions:write + environment approval',
    requiredChecksApply: false,
    notes: 'Environment protection adds human gate but not artifact-bound grant.',
  },
  {
    id: 'aws_direct',
    action: 'Direct ECR push / SSM deploy outside GitHub',
    typicalPrincipal: 'IAM user/role with ECR/SSM privileges',
    requiredChecksApply: false,
    notes: 'Requires promotion broker credentials scoped to grant consume or ABAC.',
  },
  {
    id: 'prod_flags_runtime',
    action: 'Feature flag / runtime config flip in production DB or host env',
    typicalPrincipal: 'App admin routes, SSH, or Internal API',
    requiredChecksApply: false,
    notes: 'Separate prod_flags scope; same grant model as deploy.',
  },
];

export function routesBypassingRequiredChecks(): DeliveryRoute[] {
  return YAWP_DELIVERY_ROUTES.filter((r) => !r.requiredChecksApply);
}
