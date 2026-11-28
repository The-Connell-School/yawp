/** Bound a drain so a health check can return while App Runner still has CPU. */
export function settleWithin(work: Promise<unknown>, ms: number) {
  return Promise.race([
    work.then(
      () => undefined,
      () => undefined
    ),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}
