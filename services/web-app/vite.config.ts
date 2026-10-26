import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const viteDir = path.dirname(fileURLToPath(import.meta.url));
const reactRouterWithPreviewIngress = path.resolve(
  viteDir,
  'vite/react-router-with-preview-ingress.ts'
);
const reactRouterOriginal = fileURLToPath(import.meta.resolve('react-router'));
const devPanelEntryStub = path.resolve(
  viteDir,
  'app/dev-panel/dev-panel-entry.stub.tsx'
);

function omitDevPanelFromProductionBuild(): Plugin {
  const production = process.env.YAWP_ENVIRONMENT === 'production';
  return {
    name: 'yawp-omit-dev-panel-production',
    enforce: 'pre',
    resolveId(source) {
      if (!production) return null;
      if (
        source.endsWith('dev-panel/dev-panel-entry.tsx') ||
        source.endsWith('dev-panel/dev-panel-entry')
      ) {
        return devPanelEntryStub;
      }
      return null;
    },
  };
}

function previewIngressReactRouterSsrAlias(): Plugin {
  return {
    name: 'yawp-preview-ingress-react-router-ssr-alias',
    enforce: 'pre',
    resolveId(source, _importer, options) {
      if (!options?.ssr) return null;
      if (source === 'react-router-original') return reactRouterOriginal;
      if (source === 'react-router') return reactRouterWithPreviewIngress;
      return null;
    },
  };
}

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
  define: {
    __YAWP_DEV_PANEL_BUILD__: JSON.stringify(
      process.env.YAWP_ENVIRONMENT !== 'production'
    ),
  },
  plugins: [
    omitDevPanelFromProductionBuild(),
    previewIngressReactRouterSsrAlias(),
    redirectBareAppRoute(),
    reactRouter(),
    tsconfigPaths(),
  ],
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
