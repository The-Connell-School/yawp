import { basePrisma } from './db.server';
import { InternalQaAccounts } from './internal-qa.server';
import { createQaHttp } from './internal-qa-http.server';
export const internalQa = createQaHttp(new InternalQaAccounts(basePrisma),
  () => process.env.YAWP_MANAGEMENT_SERVICE_KEY, () => process.env.INTERNAL_QA_ENABLED === 'true');
