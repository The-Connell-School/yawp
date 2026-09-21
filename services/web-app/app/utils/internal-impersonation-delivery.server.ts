type Options = {
  schedule?: (callback: () => void) => () => void;
  reportFailure?: () => void;
};

/** Durable rows belong to the session store; this loop only schedules bounded drains. */
export function startEndDelivery(drain: () => Promise<void>, options: Options = {}) {
  const schedule = options.schedule ?? (callback => {
    const timer = setTimeout(callback, 60000);
    timer.unref();
    return () => clearTimeout(timer);
  });
  let stopped = false;
  let cancel: (() => void) | undefined;
  async function run() {
    if (stopped) return;
    try { await drain(); }
    catch { options.reportFailure?.(); }
    finally { if (!stopped) cancel = schedule(() => { void run(); }); }
  }
  void run();
  return () => { stopped = true; cancel?.(); };
}
