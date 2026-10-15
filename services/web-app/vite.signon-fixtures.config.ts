import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
// Deliberately separate from React Router's app/build. Loopback-only local UI fixtures.
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5293, strictPort: true },
});
