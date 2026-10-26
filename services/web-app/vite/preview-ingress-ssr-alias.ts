import type { Plugin } from 'vite';

type PreviewIngressEnv = {
  YAWP_ENVIRONMENT?: string;
};

export function shouldApplyPreviewIngressReactRouterSsrAlias(
  env: PreviewIngressEnv = process.env as PreviewIngressEnv
): boolean {
  return env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview';
}

export function createPreviewIngressReactRouterSsrAliasPlugin(options: {
  reactRouterOriginal: string;
  reactRouterWithPreviewIngress: string;
  env?: PreviewIngressEnv;
}): Plugin {
  const previewBuild = shouldApplyPreviewIngressReactRouterSsrAlias(
    options.env ?? (process.env as PreviewIngressEnv)
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
