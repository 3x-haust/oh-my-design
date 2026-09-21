import type { Page } from 'playwright';

const FREEZE_STYLE = '*, *::before, *::after { animation-play-state: paused !important; transition-property: none !important; caret-color: transparent !important; }';
const ANALYSIS_STYLE = `${FREEZE_STYLE} a, a * { text-decoration: none !important; text-shadow: none !important; }`;
const HIDDEN_TEXT_STYLE = `${ANALYSIS_STYLE} a, a * { -webkit-text-fill-color: transparent !important; }`;

export async function captureFrozenSearchText(page: Page): Promise<Readonly<{
  evidence: Buffer;
  visibleText: Buffer;
  hiddenText: Buffer;
  confirmedVisibleText: Buffer;
}>> {
  const session = await page.context().newCDPSession(page);
  let paused = false; let styleSheetId: string | undefined;
  try {
    await Promise.all([session.send('Page.enable'), session.send('DOM.enable'), session.send('CSS.enable'), session.send('Debugger.enable')]);
    const frameTree = await session.send('Page.getFrameTree');
    styleSheetId = (await session.send('CSS.createStyleSheet', { frameId: frameTree.frameTree.frame.id })).styleSheetId;
    await session.send('Debugger.pause'); paused = true;
    const capture = async (): Promise<Buffer> => Buffer.from((await session.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    })).data, 'base64');
    await session.send('CSS.setStyleSheetText', { styleSheetId, text: FREEZE_STYLE }); const evidence = await capture();
    await session.send('CSS.setStyleSheetText', { styleSheetId, text: ANALYSIS_STYLE }); const visibleText = await capture();
    await session.send('CSS.setStyleSheetText', { styleSheetId, text: HIDDEN_TEXT_STYLE }); const hiddenText = await capture();
    await session.send('CSS.setStyleSheetText', { styleSheetId, text: ANALYSIS_STYLE }); const confirmedVisibleText = await capture();
    await session.send('CSS.setStyleSheetText', { styleSheetId, text: '' });
    return { evidence, visibleText, hiddenText, confirmedVisibleText };
  } finally {
    if (styleSheetId !== undefined) await session.send('CSS.setStyleSheetText', { styleSheetId, text: '' }).catch(() => {});
    if (paused) await session.send('Debugger.resume').catch(() => {});
    await session.detach().catch(() => {});
  }
}
