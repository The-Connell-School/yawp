const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POSITIVE_INT_RE = /^[1-9][0-9]*$/;

export function buildPreviewEnvironment({ prNumber, productLabSlug = '' }) {
  const normalizedPrNumber = String(prNumber ?? '').trim();
  const normalizedLabSlug = String(productLabSlug ?? '').trim();

  if (!POSITIVE_INT_RE.test(normalizedPrNumber)) {
    throw new Error('prNumber must be a positive integer');
  }

  if (normalizedLabSlug) {
    if (!SLUG_RE.test(normalizedLabSlug)) {
      throw new Error('productLabSlug must be kebab-case');
    }

    return {
      databaseSchema: `lab_${normalizedLabSlug.replaceAll('-', '_')}`,
      envId: `lab-${normalizedLabSlug}`,
      imageTag: `lab-${normalizedLabSlug}`,
      stateKey: `yawp/product-lab/${normalizedLabSlug}/terraform.tfstate`,
    };
  }

  return {
    databaseSchema: `pr_${normalizedPrNumber}`,
    envId: `pr-${normalizedPrNumber}`,
    imageTag: `pr-${normalizedPrNumber}`,
    stateKey: `yawp/pr/pr-${normalizedPrNumber}/terraform.tfstate`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const env = buildPreviewEnvironment({
      prNumber: process.env.PR_NUMBER ?? process.argv[2],
      productLabSlug: process.env.PRODUCT_LAB_SLUG ?? process.argv[3],
    });

    for (const [key, value] of Object.entries(env)) {
      console.log(`${key}=${value}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
