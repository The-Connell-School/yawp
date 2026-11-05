/**
 * Read-only inventory: existing yawp tools/credentials/routes a future broker
 * would need to integrate with. NO changes in prepare-only draft.
 */
export type IntegrationSurface = {
  id: string;
  toolOrCredential: string;
  routeOrTrigger: string;
  mutateCapability: string;
  workerMayUseDirectly: false;
};

export const FUTURE_BROKER_INTEGRATION_SURFACES: IntegrationSurface[] = [
  {
    id: 'github_merge',
    toolOrCredential: 'GITHUB_TOKEN / PAT / GitHub App installation token',
    routeOrTrigger: 'PR merge, merge queue, admin bypass',
    mutateCapability: 'Write git refs (main)',
    workerMayUseDirectly: false,
  },
  {
    id: 'deploy_workflow',
    toolOrCredential: 'secrets.AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in deploy.yml',
    routeOrTrigger: 'push main + workflow_dispatch → .github/workflows/deploy.yml',
    mutateCapability: 'ECR push, SSM/bastion deploy steps',
    workerMayUseDirectly: false,
  },
  {
    id: 'github_environment',
    toolOrCredential: 'GitHub Environment protection rules (production)',
    routeOrTrigger: 'deploy-web-app-production job',
    mutateCapability: 'Human approval gate (not artifact-bound today)',
    workerMayUseDirectly: false,
  },
  {
    id: 'prod_flags',
    toolOrCredential: 'App DB admin / Internal API / host env SSH',
    routeOrTrigger: 'Runtime feature flags & config',
    mutateCapability: 'Production behavior toggles',
    workerMayUseDirectly: false,
  },
];
