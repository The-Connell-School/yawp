import { prepareE2E } from './prepare-e2e';
import { logScriptError } from '../app/utils/log-script-error.server';

prepareE2E().catch((error) => {
  // eslint-disable-next-line no-console
  logScriptError(error);
  process.exit(1);
});
