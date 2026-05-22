import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPreviewEnvironment } from './preview-environment-id.mjs';

test('uses PR-scoped identifiers when no Product Lab slug is provided', () => {
  assert.deepEqual(buildPreviewEnvironment({ prNumber: '136' }), {
    databaseSchema: 'pr_136',
    envId: 'pr-136',
    imageTag: 'pr-136',
    stateKey: 'yawp/pr/pr-136/terraform.tfstate',
  });
});

test('uses stable Product Lab identifiers when a lab slug is provided', () => {
  assert.deepEqual(
    buildPreviewEnvironment({
      prNumber: '136',
      productLabSlug: 'product-lab-build-out',
    }),
    {
      databaseSchema: 'lab_product_lab_build_out',
      envId: 'lab-product-lab-build-out',
      imageTag: 'lab-product-lab-build-out',
      stateKey: 'yawp/product-lab/product-lab-build-out/terraform.tfstate',
    },
  );
});

test('rejects invalid PR numbers and Product Lab slugs', () => {
  assert.throws(
    () => buildPreviewEnvironment({ prNumber: 'abc' }),
    /prNumber must be a positive integer/,
  );
  assert.throws(
    () => buildPreviewEnvironment({ prNumber: '136', productLabSlug: 'Bad Slug' }),
    /productLabSlug must be kebab-case/,
  );
});
