import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const deployScript = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../../.github/workflows/demo-environment.yml', import.meta.url),
  'utf8'
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

  test('demo workflow builds on GitHub-hosted runners and forwards image URIs to the host', () => {
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('build-demo-images');
    expect(workflow).toContain('needs: build-demo-images');
    expect(workflow).toContain('docker/setup-buildx-action');
    expect(workflow).toContain('role-to-assume: ${{ vars.DEMO_ECR_PUSH_ROLE_ARN }}');
    expect(workflow).toContain('amazon-ecr-login');
    expect(workflow).toContain('describe-images');
    expect(workflow).toContain('target: production');
    expect(workflow).toContain('target: deps');
    expect(workflow).toContain('linux/amd64');
    expect(workflow).toContain('cache-from: type=gha');
    expect(workflow).toContain('DEMO_WEB_IMAGE=');
    expect(workflow).toContain('DEMO_TOOLBOX_IMAGE=');
    expect(workflow).toContain('DEPLOY_TIMEOUT_SECONDS=1200');
    expect(workflow).toContain('environment: demo');
  });
});
