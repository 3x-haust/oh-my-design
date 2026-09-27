import { chromium } from 'playwright';
import { browseFail } from './contract.ts';

/** Decode the already observed item response locally at its native dimensions. Never hotlink,
 * crop, enlarge a thumbnail, or measure the gallery wrapper as if it were the pictured app. */
export async function renderWholeBrowseImage(bytes: Buffer, mime: string, expected: { width: number; height: number }): Promise<Buffer> {
  if (bytes.length > 50 * 1024 * 1024 || !/^image\/(?:png|jpeg|webp|gif|svg\+xml|avif)$/i.test(mime)
    || expected.width * expected.height > 16_000_000 || Math.max(expected.width, expected.height) > 16_384
    || Math.min(expected.width, expected.height) < 1) browseFail('BROWSE_WHOLE_IMAGE_LIMIT', 'loaded whole item image exceeds supported dimensions/format');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: expected, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage(); await page.setContent('<!doctype html><body style="margin:0"></body>');
    const size = await page.evaluate(async ({ data }) => {
      const image = document.createElement('img'); image.src = data; image.style.cssText = 'display:block;max-width:none';
      document.body.append(image); await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, { data: `data:${mime};base64,${bytes.toString('base64')}` });
    if (size.width !== expected.width || size.height !== expected.height) browseFail('BROWSE_WHOLE_IMAGE_SIZE', 'original response dimensions differ from the observed loaded item');
    return await page.screenshot();
  } finally { await browser.close(); }
}
