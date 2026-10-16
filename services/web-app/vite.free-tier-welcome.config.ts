import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Presentation fixtures only; no application routes or database connection.
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  cacheDir: process.env.TMPDIR + '/fto-free-page-vite',
  server: { host: '127.0.0.1', strictPort: true },
});
