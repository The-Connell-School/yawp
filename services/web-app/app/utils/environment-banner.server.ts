export type EnvironmentBannerWarning = 'staging' | 'localhost' | 'preview' | null;

export function getEnvironmentBannerWarning(
  requestUrl: string,
  env: Record<string, string | undefined> = process.env
): EnvironmentBannerWarning {
  const url = new URL(requestUrl);

  if (url.hostname.includes('staging')) {
    return 'staging';
  }

  if (env.YAWP_ENVIRONMENT === 'preview') {
    return 'preview';
  }

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return 'localhost';
  }

  return null;
}

export function shouldEnableLocalDevQuickLogin({
  bannerWarning,
  localDevAuthEnabled,
}: {
  bannerWarning: EnvironmentBannerWarning;
  localDevAuthEnabled: boolean;
}) {
  return (
    localDevAuthEnabled &&
    (bannerWarning === 'localhost' || bannerWarning === 'preview')
  );
}
