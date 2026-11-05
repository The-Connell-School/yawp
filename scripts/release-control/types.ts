/** Promotion scopes — independent generation counters and holds. */
export const PROMOTION_SCOPES = [
  'main_merge',
  'prod_deploy',
  'prod_flags',
] as const;

export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

export type ArtifactBinding = {
  /** Full 40-char git commit SHA (lowercase hex). */
  commitSha: string;
  /** OCI/docker digest when the scope binds an image (prod_deploy). */
  imageDigest?: string;
};

export type HoldRecord = {
  active: true;
  permanent: boolean;
  reason: string;
  setAtMs: number;
  /** Identity from a verified approval issuer — not an worker-supplied string. */
  setBySubject: string;
  /** Scope generation when the hold was placed (grants below this are stale). */
  generationWhenSet: number;
};

export type ScopeRecord = {
  scope: PromotionScope;
  generation: number;
  hold: HoldRecord | null;
  updatedAtMs: number;
};

export type GrantRecord = {
  grantId: string;
  scope: PromotionScope;
  artifact: ArtifactBinding;
  issuedAtGeneration: number;
  expiresAtMs: number;
  issuedAtMs: number;
  approvalSubject: string;
  consume?: {
    consumedAtMs: number;
    /** Workflow run id + attempt — replay-safe idempotency. */
    idempotencyKey: string;
  };
};

export type AuditEvent = {
  eventId: string;
  atMs: number;
  kind: string;
  scope?: PromotionScope;
  detail: Record<string, unknown>;
};

export type VerifiedApproval = {
  subject: string;
  scope: PromotionScope;
  artifact: ArtifactBinding;
  expiresAtMs: number;
  jti: string;
};
