import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  resolve: {
    conditions: ['import', 'require'],
  },
  ssr: {
    noExternal: ['posthog-js', 'posthog-js/react'],
  },
  server: { allowedHosts: true }, // Allow ngrok to forward twilio webhook calls
});
