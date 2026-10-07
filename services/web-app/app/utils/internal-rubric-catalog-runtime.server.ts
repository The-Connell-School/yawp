import { basePrisma } from './db.server';
import { RubricCatalog } from '~/domain/rubrics/rubric-catalog.server';
import { createRubricCatalogHttp } from './internal-rubric-catalog-http.server';
export const rubricCatalogHttp = createRubricCatalogHttp(new RubricCatalog(basePrisma), () => process.env.YAWP_MANAGEMENT_SERVICE_KEY);