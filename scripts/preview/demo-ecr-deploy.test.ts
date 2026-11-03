import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

const demoImageRegistryMainTf = readFileSync(
  path.resolve('infra/demo-image-registry/main.tf'),
  'utf8'
);

const liveDemoImagePushTrustStringEquals = {
  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
  'token.actions.githubusercontent.com:sub': [
    'repo:The-Connell-School/yawp:environment:demo',
    'repo:The-Connell-School@157837314/yawp@989330947:environment:demo',
  ],
} as const;

describe('demo ECR image pull path', () => {
  test('demo image push IAM role trusts legacy and immutable GitHub demo OIDC subjects', () => {
    expect(demoImageRegistryMainTf).toContain('variable "github_oidc_demo_environment_subjects"');
    expect(demoImageRegistryMainTf).toContain(
      'repo:The-Connell-School/yawp:environment:demo'
    );
    expect(demoImageRegistryMainTf).toContain(
      'repo:The-Connell-School@157837314/yawp@989330947:environment:demo'
    );
    expect(demoImageRegistryMainTf).toContain(
      '"token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"'
    );
    expect(demoImageRegistryMainTf).toContain(
      '"token.actions.githubusercontent.com:sub" = var.github_oidc_demo_environment_subjects'
    );
    expect(demoImageRegistryMainTf).not.toMatch(/StringLike[\s\S]*githubusercontent/);
    const trustBlock = demoImageRegistryMainTf.slice(
      demoImageRegistryMainTf.indexOf('resource "aws_iam_role" "demo_image_push"'),
      demoImageRegistryMainTf.indexOf('resource "aws_iam_role_policy" "demo_image_push"')
    );
    expect(trustBlock).not.toContain('StringLike');
    expect(trustBlock).not.toMatch(/:sub"[\s\S]*\*/);

    const defaultSubjectsBlock =
      demoImageRegistryMainTf.match(
        /variable "github_oidc_demo_environment_subjects"[\s\S]*?default = \[([\s\S]*?)\]\n/m
      )?.[1] ?? '';
    expect(defaultSubjectsBlock.length).toBeGreaterThan(0);
    for (const subject of liveDemoImagePushTrustStringEquals[
      'token.actions.githubusercontent.com:sub'
    ]) {
      expect(defaultSubjectsBlock).toContain(subject);
    }
    const legacyIndex = defaultSubjectsBlock.indexOf(
      liveDemoImagePushTrustStringEquals['token.actions.githubusercontent.com:sub'][0]
    );
    const immutableIndex = defaultSubjectsBlock.indexOf(
      liveDemoImagePushTrustStringEquals['token.actions.githubusercontent.com:sub'][1]
    );
    expect(legacyIndex).toBeGreaterThan(-1);
    expect(immutableIndex).toBeGreaterThan(legacyIndex);
  });

  test('demo ECR push role policy includes buildx read actions on demo repositories', () => {
    const pushPolicyBlock = demoImageRegistryMainTf.slice(
      demoImageRegistryMainTf.indexOf('Sid    = "PushDemoImages"'),
      demoImageRegistryMainTf.indexOf('Resource = [for repository in aws_ecr_repository.demo')
    );
    const expectedPushActions = [
      'ecr:BatchCheckLayerAvailability',
      'ecr:BatchGetImage',
      'ecr:CompleteLayerUpload',
      'ecr:GetDownloadUrlForLayer',
      'ecr:InitiateLayerUpload',
      'ecr:PutImage',
      'ecr:UploadLayerPart',
      'ecr:DescribeRepositories',
      'ecr:DescribeImages',
      'ecr:ListImages',
    ];
    for (const action of expectedPushActions) {
      expect(pushPolicyBlock).toContain(`"${action}"`);
    }
    expect(demoImageRegistryMainTf).toContain(
      'Resource = [for repository in aws_ecr_repository.demo : repository.arn]'
    );
  });

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
    expect(buildJob).toContain(
      'configure-aws-credentials@7474bc4690e29a8392af63c5b98e7449536d5c3a # v4.3.1'
    );
    expect(buildJob).toContain('amazon-ecr-login');
    expect(buildJob).toContain('describe-images --repository-name yawp-demo-web');
    expect(buildJob).toContain('describe-images --repository-name yawp-demo-toolbox');
    expect(buildJob).toContain('skip_web=true');
    expect(buildJob).toContain('skip_toolbox=true');
    expect(buildJob).toContain("steps.images-ecr.outputs.skip_web != 'true'");
    expect(buildJob).toContain("steps.images-ecr.outputs.skip_toolbox != 'true'");
    expect(buildJob).not.toContain('skip_build=true');
  });

  test('deploy timeout is 1200s for ECR pull and 3600s for on-host build fallback', () => {
    expect(deployStep).toContain('deploy_timeout_seconds=3600');
    expect(deployStep).toContain('deploy_timeout_seconds=1200');
    expect(deployStep).toContain('DEPLOY_TIMEOUT_SECONDS="$deploy_timeout_seconds"');
    const timeoutBlock = deployStep.slice(
      deployStep.indexOf('deploy_timeout_seconds=3600'),
      deployStep.indexOf('lock_file="${PREVIEW_ROOT}/preview-host.lock"')
    );
    expect(timeoutBlock.indexOf('deploy_timeout_seconds=1200')).toBeGreaterThan(
      timeoutBlock.indexOf('if [[ -n "$demo_web_image"')
    );
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
    expect(workflow).toContain('environment: demo');
    expect(workflow).toContain('docker/setup-buildx-action');
    expect(workflow).toContain('target: production');
    expect(workflow).toContain('target: deps');
    expect(workflow).toContain('cache-from: type=gha');
  });
});
