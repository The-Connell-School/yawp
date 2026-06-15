import baseConfig from './playwright.config';

export default {
  ...baseConfig,
  globalTeardown: undefined,
  webServer: undefined,
};
