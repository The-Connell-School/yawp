import { basePrisma } from './db.server';
import { InternalRubrics } from './internal-rubrics.server';
import { createRubricHttp } from './internal-rubrics-http.server';
export const internalRubrics = createRubricHttp(new InternalRubrics(basePrisma),
  () => process.env.YAWP_CONTENT_SERVICE_KEY,
  () => process.env.INTERNAL_CONTENT_ENABLED === 'true');
