import { chromium } from 'playwright';
import { browseFail } from './contract.ts';

// Gallery detail pages often show a whole site as one very tall capture; the live site is the better original.
const TOO_LARGE = 'loaded whole item image exceeds supported dimensions/format. When it is a full-page capture of a site, '
  + 'open the site itself with omd ref browse goto <its URL> (this gallery page records how you found it), then shot and keep it';

/** Decode the already observed item response locally at its native dimensions. Never hotlink,
 * crop, enlarge a thumbnail, or measure the gallery wrapper as if it were the pictured app. */
export async function renderWholeBrowseImage(bytes: Buffer, mime: string, expected: { width: number; height: number }): Promise<Buffer> {
  if (bytes.length > 50 * 1024 * 1024 || !/^image\/(?:png|jpeg|webp|gif|svg\+xml|avif)$/i.test(mime)
    || expected.width * expected.height > 16_000_000 || Math.max(expected.width, expected.height) > 16_384
    || Math.min(expected.width, expected.height) < 1) browseFail('BROWSE_WHOLE_IMAGE_LIMIT', TOO_LARGE);
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
    // A srcset density descriptor (1.5x, 2x, 3x) reports naturalWidth divided by the density, so the
    // file decodes larger at the same aspect. Accept that scale; any other mismatch is a different image.
    const scale = size.width / expected.width;
    if (scale < 1 || scale > 4 || Math.abs(size.height - expected.height * scale) > Math.ceil(scale)) {
      browseFail('BROWSE_WHOLE_IMAGE_SIZE', 'original response dimensions differ from the observed loaded item: the gallery serves a resized copy. '
        + 'Open the work\'s own site with omd ref browse goto <its URL> (this gallery page records how you found it), then shot and keep it there');
    }
    if (size.width !== expected.width) {
      if (size.width * size.height > 16_000_000 || Math.max(size.width, size.height) > 16_384) browseFail('BROWSE_WHOLE_IMAGE_LIMIT', TOO_LARGE);
      await page.setViewportSize(size);
    }
    return await page.screenshot();
  } finally { await browser.close(); }
}
