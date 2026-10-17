/** No stored organization timezone exists. UTC calendar months are the I5 fallback. */
export function lessonPlanMonthWindow(now: Date) {
  return {
    gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
