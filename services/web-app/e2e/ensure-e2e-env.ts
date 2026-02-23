import { prepareE2E } from './prepare-e2e';

prepareE2E().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
