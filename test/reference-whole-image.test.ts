import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { renderWholeBrowseImage } from '../core/ref/browse/whole-image.ts';

const png = (width: number, height: number) => {
  const image = new PNG({ width, height });
  image.data.fill(180);
  return PNG.sync.write(image);
};

test('a srcset 2x original decodes at its native size and is kept whole', { timeout: 60_000 }, async () => {
  const out = PNG.sync.read(await renderWholeBrowseImage(png(80, 40), 'image/png', { width: 40, height: 20 }));
  assert.deepEqual([out.width, out.height], [80, 40]);
  const same = PNG.sync.read(await renderWholeBrowseImage(png(40, 20), 'image/png', { width: 40, height: 20 }));
  assert.deepEqual([same.width, same.height], [40, 20]);
});

test('a different image, a smaller file or a changed aspect is still refused', { timeout: 60_000 }, async () => {
  await assert.rejects(() => renderWholeBrowseImage(png(80, 60), 'image/png', { width: 40, height: 20 }), /BROWSE_WHOLE_IMAGE_SIZE/);
  await assert.rejects(() => renderWholeBrowseImage(png(20, 10), 'image/png', { width: 40, height: 20 }), /BROWSE_WHOLE_IMAGE_SIZE/);
});
