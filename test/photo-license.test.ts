import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERMITTED_PHOTO_LICENSES, PhotoLicenseError, validatePhotoProvenance } from '../core/graphics/photo-license.ts';

const base = {
  source: 'Unsplash',
  sourcePage: 'https://unsplash.com/photos/abc123',
  license: 'Unsplash' as const,
  localPath: 'assets/hero-portrait.jpg',
  altText: 'A ceramicist shaping a bowl on a wheel, warm side light',
};

test('a non-attribution licence (Unsplash/CC0) validates with source, page, path, and alt text', () => {
  const ok = validatePhotoProvenance(base);
  assert.equal(ok.license, 'Unsplash');
  assert.equal(ok.altText, base.altText);
  assert.equal(ok.attribution, undefined);
  assert.deepEqual(validatePhotoProvenance({ ...base, source: 'Openverse', license: 'CC0', sourcePage: 'https://openverse.org/image/x' }).license, 'CC0');
});

test('a CC-BY photo requires a photographer credit and a rendered attribution string', () => {
  const cc = { ...base, source: 'Wikimedia Commons', sourcePage: 'https://commons.wikimedia.org/wiki/File:X.jpg', license: 'CC-BY' as const };
  assert.throws(() => validatePhotoProvenance(cc), (e: unknown) => e instanceof PhotoLicenseError && /attribution/i.test(e.reason));
  const ok = validatePhotoProvenance({ ...cc, photographer: 'Jane Doe', attribution: 'Photo by Jane Doe / CC BY 4.0' });
  assert.equal(ok.attribution, 'Photo by Jane Doe / CC BY 4.0');
  assert.equal(PERMITTED_PHOTO_LICENSES['CC-BY'].requiresAttribution, true);
});

test('an unpermitted or unknown licence never ships', () => {
  for (const license of ['all-rights-reserved', 'Getty', 'Pinterest', 'unknown', '']) {
    assert.throws(() => validatePhotoProvenance({ ...base, license }), /license must be one of|unpermitted/i);
  }
});

test('a shipped photo needs a real source page, a safe local path, and descriptive alt text', () => {
  assert.throws(() => validatePhotoProvenance({ ...base, sourcePage: 'not-a-url' }), /sourcePage/);
  assert.throws(() => validatePhotoProvenance({ ...base, sourcePage: 'http://unsplash.com/x' }), /https/);
  assert.throws(() => validatePhotoProvenance({ ...base, localPath: '/etc/passwd' }), /project-relative/);
  assert.throws(() => validatePhotoProvenance({ ...base, localPath: '../secret.jpg' }), /project-relative/);
  assert.throws(() => validatePhotoProvenance({ ...base, altText: '' }), /altText is required/);
  assert.throws(() => validatePhotoProvenance({ ...base, altText: 'hero-portrait.jpg' }), /describe the image, not be a filename/);
  assert.throws(() => validatePhotoProvenance({ ...base, extra: 1 }), /unknown field/);
});

test('the sourcing protocol documents permitted libraries, the CC-BY attribution rule, and the never-ship list', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const doc = join(root, 'core', 'graphics', 'photo-sourcing.md');
  assert.ok(existsSync(doc), 'photo-sourcing.md must exist');
  const md = readFileSync(doc, 'utf8').replace(/\s+/g, ' ');
  assert.match(md, /Unsplash[\s\S]*Pexels[\s\S]*Openverse[\s\S]*Wikimedia/i);
  assert.match(md, /CC-BY family requires attribution/i);
  assert.match(md, /Pinterest[\s\S]*studied for mood only/i);
  assert.match(md, /never fetches, scrapes, hotlinks, or downloads/i);
});
test('the loop protocol wires shipped-photo provenance to validatePhotoProvenance', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const loop = readFileSync(join(root, 'core', 'protocol', 'human-design-loop.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(loop, /validated per `graphics\/photo-sourcing\.md` \(`validatePhotoProvenance`\)/i);
  assert.match(loop, /An unpermitted or unknown licence \(Pinterest, Getty, all-rights-reserved\) never ships/i);
});
