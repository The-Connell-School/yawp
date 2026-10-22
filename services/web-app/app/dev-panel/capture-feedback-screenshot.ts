export async function captureFeedbackScreenshot() {
  const target =
    document.querySelector('[data-feedback-content-frame]') ?? document.body;
  document.documentElement.classList.add('yawp-dev-panel-capturing');
  try {
    const { toPng } = await import('html-to-image');
    return await toPng(target as HTMLElement, {
      cacheBust: true,
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        return !node.closest('[data-yawp-dev-panel]');
      },
    });
  } finally {
    document.documentElement.classList.remove('yawp-dev-panel-capturing');
  }
}
