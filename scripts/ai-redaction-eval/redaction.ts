/**
 * Re-exports the REAL redaction/rehydration primitives the grading route
 * uses in production, via a plain relative import (no `~` alias needed —
 * these are all dependency-free pure functions, see the module comments in
 * app/utils/ai-redaction/*.server.ts). This is intentional: the whole point
 * of this eval is to exercise the exact code under test, not a
 * reimplementation of it.
 */
export {
  buildRedactionMapping,
  redact,
  rehydrate,
  type RedactionMapping,
} from '../../services/web-app/app/utils/ai-redaction/index';
