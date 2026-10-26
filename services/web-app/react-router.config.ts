import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // TLS terminates at CloudFront/App Runner; Node sees http:// while browsers send https:// Origin.
  allowedActionOrigins: [
    "yawp.school",
    "demo.yawp.school",
    "ua.yawp.school",
    "*.preview.yawp.school",
  ],
  future: {
    unstable_optimizeDeps: true,
    v8_middleware: true,
  },
} satisfies Config;
