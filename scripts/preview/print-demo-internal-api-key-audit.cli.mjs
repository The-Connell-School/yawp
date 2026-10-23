import {
  auditInternalApiKeys,
  formatDemoInternalApiKeyAudit,
} from './demo-internal-api-key-audit.mjs';

console.log(
  formatDemoInternalApiKeyAudit(
    auditInternalApiKeys(process.env.YAWP_INTERNAL_API_KEYS)
  )
);
