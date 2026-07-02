import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

function redirectBareAppRoute(): Plugin {
  return {
    name: 'yawp-redirect-bare-app-route',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/app' || req.url?.startsWith('/app?')) {
          const location = `/app/${req.url.slice('/app'.length)}`;
          res.statusCode = 308;
          res.setHeader('Location', location);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [redirectBareAppRoute(), reactRouter(), tsconfigPaths()],
  resolve: {
    conditions: ['import', 'require'],
  },
  ssr: {
    noExternal: ['posthog-js', 'posthog-js/react'],
  },
  server: {
    port: Number(process.env.PORT ?? 5176),
    strictPort: true,
    allowedHosts: true, // Allow ngrok to forward twilio webhook calls
  },
});
