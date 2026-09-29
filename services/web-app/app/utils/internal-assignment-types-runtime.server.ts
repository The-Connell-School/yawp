import { basePrisma } from './db.server';
import { InternalAssignmentTypes } from './internal-assignment-types.server';
import { createAssignmentTypesHttp } from './internal-assignment-types-http.server';

export const internalAssignmentTypes = createAssignmentTypesHttp(
  new InternalAssignmentTypes(basePrisma as any),
  () => process.env.YAWP_CONTENT_SERVICE_KEY,
  () => process.env.INTERNAL_CONTENT_ENABLED === 'true'
);

