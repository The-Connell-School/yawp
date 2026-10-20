import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const deployScript = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../../.github/workflows/demo-environment.yml', import.meta.url),
  'utf8'
);

const buildJob = workflow.slice(
  workflow.indexOf('  build-demo-images:'),
  workflow.indexOf('  demo-deploy:')
);
const deployStep = workflow.slice(
  workflow.indexOf('- name: Deploy demo'),
  workflow.indexOf('- name: Verify the demo actually serves')
);

describe('demo ECR image pull path', () => {
  test('deploy.sh logs into ECR and pulls when demo image variables are set', () => {
    expect(deployScript).toContain('DEMO_WEB_IMAGE');
    expect(deployScript).toContain('DEMO_TOOLBOX_IMAGE');
    expect(deployScript).toContain('ecr get-login-password');
    expect(deployScript).toContain('docker login --username AWS --password-stdin');
    expect(deployScript).toContain('build_or_pull_production_images web toolbox');
    expect(deployScript).toContain('build_or_pull_production_images web');
    expect(deployScript).toContain('"${compose[@]}" pull "${services[@]}"');
    expect(deployScript).toContain('"${compose[@]}" build "${services[@]}"');
  });

  test('ECR push path builds per repository and skips existing immutable tags', () => {
    expect(buildJob).toContain('vars.DEMO_ECR_PUSH_ROLE_ARN !=');
    expect(buildJob).toContain('configure-aws-credentials@v4');
    expect(buildJob).toContain('amazon-ecr-login');
    expect(buildJob).toContain('describe-images --repository-name yawp-demo-web');
    expect(buildJob).toContain('describe-images --repository-name yawp-demo-toolbox');
    expect(buildJob).toContain('skip_web=true');
    expect(buildJob).toContain('skip_toolbox=true');
    expect(buildJob).toContain("steps.images-ecr.outputs.skip_web != 'true'");
    expect(buildJob).toContain("steps.images-ecr.outputs.skip_toolbox != 'true'");
    expect(buildJob).not.toContain('skip_build=true');
  });

  test('when DEMO_ECR_PUSH_ROLE_ARN is unset, build job succeeds with empty outputs and deploy omits image vars', () => {
    expect(buildJob).toContain('id: images-fallback');
    expect(buildJob).toContain("vars.DEMO_ECR_PUSH_ROLE_ARN == ''");
    expect(buildJob).toContain('echo "web_image=" >> "$GITHUB_OUTPUT"');
    expect(buildJob).toContain('echo "toolbox_image=" >> "$GITHUB_OUTPUT"');
    expect(buildJob).not.toContain('Missing repository variable DEMO_ECR_PUSH_ROLE_ARN');
    expect(deployStep).toContain('needs.build-demo-images.outputs.demo_web_image');
    expect(deployStep).toContain('if [[ -n "$demo_web_image" && -n "$demo_toolbox_image" ]]; then');
    expect(deployStep).toContain('remote_env+=(');
    expect(deployStep).toContain('"DEMO_WEB_IMAGE=$(shell_quote "$demo_web_image")"');
    expect(deployStep).not.toMatch(
      /remote_env=\([\s\S]*"DEMO_WEB_IMAGE=\$\(shell_quote "\$DEMO_WEB_IMAGE"\)"[\s\S]*\)/
    );
  });

  test('when ECR outputs are set, deploy forwards both image URIs to the host', () => {
    expect(deployStep).toContain('"DEMO_TOOLBOX_IMAGE=$(shell_quote "$demo_toolbox_image")"');
    expect(workflow).toContain('DEPLOY_TIMEOUT_SECONDS=1200');
    expect(workflow).toContain('environment: demo');
    expect(workflow).toContain('docker/setup-buildx-action');
    expect(workflow).toContain('target: production');
    expect(workflow).toContain('target: deps');
    expect(workflow).toContain('cache-from: type=gha');
  });
});
