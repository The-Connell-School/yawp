export function isLocalDatabaseUrl(url: string): boolean {
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    /@postgres(?::|\/)/.test(url) ||
    /@preview-postgres(?::|\/)/.test(url) ||
    /@yawp-pr-\d+-postgres-1(?::|\/)/.test(url)
  );
}
