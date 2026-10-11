import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Viewport = '1280x900' | '390x844';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/trusted-lifecycle-images.json', import.meta.url), 'utf8')) as {
  schema: string;
  images: Record<Viewport, { sha256: string; pngBase64: string }>;
};

export function trustedLifecyclePng(viewport: Viewport): Buffer {
  assert.equal(fixture.schema, 'test-only-render-fixture-v1');
  const image = fixture.images[viewport];
  const bytes = Buffer.from(image.pngBase64, 'base64');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
  return bytes;
}
