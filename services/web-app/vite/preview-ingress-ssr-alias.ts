import type { Plugin } from 'vite';

export function shouldApplyPreviewIngressReactRouterSsrAlias(
  env: Pick<NodeJS.ProcessEnv, 'YAWP_ENVIRONMENT'> = process.env
): boolean {
  return env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview';
}

export function createPreviewIngressReactRouterSsrAliasPlugin(options: {
  reactRouterOriginal: string;
  reactRouterWithPreviewIngress: string;
  env?: Pick<NodeJS.ProcessEnv, 'YAWP_ENVIRONMENT'>;
}): Plugin {
  const previewBuild = shouldApplyPreviewIngressReactRouterSsrAlias(
    options.env ?? process.env
  );
  return {
    name: 'yawp-preview-ingress-react-router-ssr-alias',
    enforce: 'pre',
    resolveId(source, _importer, resolveOptions) {
      if (!previewBuild) return null;
      if (!resolveOptions?.ssr) return null;
      if (source === 'react-router-original') return options.reactRouterOriginal;
      if (source === 'react-router') return options.reactRouterWithPreviewIngress;
      return null;
    },
  };
}
