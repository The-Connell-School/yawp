/**
 * Production HTTP server for Yawp! Same stack as @react-router/serve, but
 * registers the site-license course asset gate before static public files.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequestHandler as rrCreateRequestHandler } from '@react-router/express';
import { createRequestListener } from '@mjackson/node-fetch-server';
import compression from 'compression';
import express from 'express';
import getPort from 'get-port';
import morgan from 'morgan';
import sourceMapSupport from 'source-map-support';
import { siteLicenseCourseAssetExpressMiddleware } from '../app/utils/site-license-course-asset-express.middleware.server';

sourceMapSupport.install({
  retrieveSourceMap(source: string) {
    if (!source.startsWith('file://')) return null;
    const filePath = fileURLToPath(source);
    const sourceMapPath = `${filePath}.map`;
    if (!fs.existsSync(sourceMapPath)) return null;
    return {
      url: source,
      map: fs.readFileSync(sourceMapPath, 'utf8'),
    };
  },
});

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

function parseNumber(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const maybe = Number(raw);
  return Number.isNaN(maybe) ? undefined : maybe;
}

function isRSCServerBuild(build: unknown) {
  return Boolean(
    typeof build === 'object' &&
      build &&
      'default' in build &&
      typeof (build as { default: unknown }).default === 'object' &&
      (build as { default: { fetch?: unknown } }).default &&
      'fetch' in (build as { default: { fetch?: unknown } }).default &&
      typeof (build as { default: { fetch: unknown } }).default.fetch ===
        'function'
  );
}

async function main() {
  const port = parseNumber(process.env.PORT) ?? (await getPort({ port: 3000 }));
  const buildPathArg = process.argv[2];
  if (!buildPathArg) {
    console.error(
      '\n  Usage: bun server/express.ts <server-build-path>\n'
    );
    process.exit(1);
  }

  const buildPath = path.resolve(buildPathArg);
  const buildModule = await import(pathToFileURL(buildPath).href);

  let build: {
    fetch?: (request: Request) => Response | Promise<Response>;
    publicPath: string;
    assetsBuildDirectory: string;
  };
  const isRSCBuild = isRSCServerBuild(buildModule);
  if (isRSCBuild) {
    const config = {
      publicPath: '/',
      assetsBuildDirectory: path.join('..', 'client'),
      ...(buildModule.unstable_reactRouterServeConfig || {}),
    };
    build = {
      fetch: buildModule.default.fetch,
      publicPath: config.publicPath,
      assetsBuildDirectory: path.resolve(path.dirname(buildPath), config.assetsBuildDirectory),
    };
  } else {
    build = buildModule as typeof build;
  }

  const onListen = () => {
    const address =
      process.env.HOST ||
      Object.values(os.networkInterfaces())
        .flat()
        .find((ip) => String(ip?.family).includes('4') && !ip?.internal)?.address;
    if (!address) {
      console.log(`[yawp-serve] http://localhost:${port}`);
    } else {
      console.log(`[yawp-serve] http://localhost:${port} (http://${address}:${port})`);
    }
  };

  const app = express();
  app.disable('x-powered-by');
  if (!isRSCBuild) {
    app.use(compression());
  }
  app.use(
    path.posix.join(build.publicPath, 'assets'),
    express.static(path.join(build.assetsBuildDirectory, 'assets'), {
      immutable: true,
      maxAge: '1y',
    })
  );
  app.use(build.publicPath, express.static(build.assetsBuildDirectory));

  // Gate thesis-essay course assets before public/ would serve them directly.
  app.use(siteLicenseCourseAssetExpressMiddleware);
  app.use(express.static('public', { maxAge: '1h' }));

  app.use(morgan('tiny'));
  if (build.fetch) {
    app.all('*', createRequestListener(build.fetch));
  } else {
    app.all(
      '*',
      rrCreateRequestHandler({
        build: buildModule,
        mode: process.env.NODE_ENV,
      })
    );
  }

  const server = process.env.HOST
    ? app.listen(port, process.env.HOST, onListen)
    : app.listen(port, onListen);

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => server?.close(console.error));
  }
}

void main();