// Regenerates services/web-app/app/utils/cloudfront-ranges.server.ts from the
// AWS-published ranges. Run occasionally: bun run scripts/update-cloudfront-ranges.ts
const res = await fetch('https://ip-ranges.amazonaws.com/ip-ranges.json');
if (!res.ok) throw new Error(`ip-ranges.json: ${res.status}`);
const data = (await res.json()) as {
  syncToken: string;
  createDate: string;
  prefixes: { ip_prefix: string; service: string }[];
};
const toNum = (cidr: string) =>
  cidr.split('/')[0]!.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const cidrs = [
  ...new Set(
    data.prefixes
      .filter((p) => p.service === 'CLOUDFRONT' || p.service === 'CLOUDFRONT_ORIGIN_FACING')
      .map((p) => p.ip_prefix)
  ),
].sort((a, b) => toNum(a) - toNum(b) || Number(a.split('/')[1]) - Number(b.split('/')[1]));
const body = `// AWS-published IPv4 ranges for CloudFront edge servers (services CLOUDFRONT and
// CLOUDFRONT_ORIGIN_FACING in https://ip-ranges.amazonaws.com/ip-ranges.json).
// Used to tell proxy hops (which we skip) from real client addresses in
// X-Forwarded-For. Regenerate with \`bun run scripts/update-cloudfront-ranges.ts\`.
// Snapshot: syncToken ${data.syncToken}, created ${data.createDate}.
export const CLOUDFRONT_IPV4_RANGES: readonly string[] = [
${cidrs.map((c) => `  '${c}',`).join('\n')}
];
`;
await Bun.write(
  new URL('../services/web-app/app/utils/cloudfront-ranges.server.ts', import.meta.url),
  body
);
console.log(`wrote ${cidrs.length} ranges`);
