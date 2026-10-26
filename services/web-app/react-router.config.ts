import type { Config } from "@react-router/dev/config";

/**
 * Browser Origin hosts allowed when they differ from `request.url` (e.g. App Runner
 * internal host behind CloudFront). Without this, RR 7.18+ single-fetch actions throw
 * `throwIfPotentialCSRFAttack` → Bad Request before route actions run.
 */
const yawpBrowserActionOrigins = [
  "yawp.school",
  "demo.yawp.school",
  "ua.yawp.school",
  "*.yawp.school",
] as const;

export default {
  ssr: true,
  allowedActionOrigins: [...yawpBrowserActionOrigins],
  future: {
    unstable_optimizeDeps: true,
    v8_middleware: true,
  },
} satisfies Config;
