import type { Config } from "@react-router/dev/config";

/**
 * Browser Origin hosts allowed when they differ from `request.url` (e.g. App Runner
 * internal host behind CloudFront). Without this, RR 7.18+ single-fetch actions throw
 * `throwIfPotentialCSRFAttack` → Bad Request before route actions run.
 *
 * PR previews (`*.preview.yawp.school`) add `*.preview.yawp.school` when
 * `YAWP_ENVIRONMENT=preview` so HTTPS browser Origins match when the adapter URL
 * stays on `http://`. Production builds omit that entry. Optional URL rewrite:
 * `vite/react-router-with-preview-ingress.ts` (may not run on preview fast dev).
 */
const baseYawpBrowserActionOrigins = [
  "yawp.school",
  "demo.yawp.school",
  "ua.yawp.school",
  "*.yawp.school",
] as const;

type YawpBrowserActionOriginsEnv = {
  YAWP_ENVIRONMENT?: string;
};

/** Preview ingress serves HTTPS to browsers but the dev adapter often sees `http://` URLs. */
export function yawpBrowserActionOrigins(
  env: YawpBrowserActionOriginsEnv = process.env as YawpBrowserActionOriginsEnv
): string[] {
  const origins: string[] = [...baseYawpBrowserActionOrigins];
  if (env.YAWP_ENVIRONMENT?.trim().toLowerCase() === "preview") {
    origins.push("*.preview.yawp.school");
  }
  return origins;
}

export default {
  ssr: true,
  allowedActionOrigins: yawpBrowserActionOrigins(),
  future: {
    unstable_optimizeDeps: true,
    v8_middleware: true,
  },
} satisfies Config;
