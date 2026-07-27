/**
 * The AP English Language rubric, re-exported for the web app.
 *
 * The rubric itself lives in `packages/prisma/scripts` because the seed needs
 * it to compose the coaching block it writes into the database, and the
 * production image ships `packages/prisma` without the web app's source. It is
 * pure data with no dependencies, so it sits equally well in either place.
 *
 * Everything in the app keeps importing it from here.
 */
export * from '../../../../../packages/prisma/scripts/ap-english-lang-rubric';
