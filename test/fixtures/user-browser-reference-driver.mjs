import { chromium } from 'playwright';

export async function userBrowserBridgeDoctor() {
  return { ready: true, cli: { installed: true }, daemon: { running: true },
    identification: { needsChoice: false, candidates: [] },
    primary: { id: 'aside', label: 'Aside' }, browsers: [{}] };
}
export async function userBrowserBridgeOnboard() { throw new Error('unexpected onboarding'); }
export async function connectUserBrowserSession({ focused }) {
  if (focused !== false) throw new Error('foreground session forbidden');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.OMD_TEST_BROWSER_EXECUTABLE });
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route('https://example.com/', route => route.fulfill({ contentType: 'text/html',
    body: `<h1>Reference work queue</h1><section id="work"><p>Ready work item</p>
      <p>${'Visible public reference task details. '.repeat(30)}</p></section>
      <div style="height:2200px">Additional document content</div>` }));
  return {
    navigate: async url => { await page.goto(url); },
    resize: async () => { throw new Error('window resize forbidden'); },
    emulate: async ({ overrides }) => {
      if (overrides.device_scale_factor !== 2) throw new Error('explicit DPR 2 required');
      await page.setViewportSize(overrides);
    },
    evaluate: async expression => ({ ok: true, value: await page.evaluate(expression) }),
    screenshot: async options => {
      const buffer = await page.screenshot({ fullPage: 'fullPage' in options });
      return { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
    },
    requestHelp: async () => { throw new Error('unexpected human handoff'); },
    stop: async () => { await browser.close(); },
  };
}
