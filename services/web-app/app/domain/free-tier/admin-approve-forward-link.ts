/** Client-safe: build not-right-person URL search (NRP in `t`, approve in `approveT`). */
export function buildAdminForwardPageSearch(
  forwardToken: string,
  approveToken: string
) {
  const params = new URLSearchParams();
  params.set('t', forwardToken);
  params.set('approveT', approveToken);
  return `?${params.toString()}`;
}
