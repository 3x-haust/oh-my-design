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

test('a legacy content photo defaults semanticRole to content and keeps descriptive alt text', () => {
  const ok = validatePhotoProvenance(base);
  assert.equal(ok.license, 'Unsplash');
  assert.equal(ok.semanticRole, 'content');
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

test('decorative photos require empty alt while functional photos describe their action', () => {
  const decorative = validatePhotoProvenance({ ...base, semanticRole: 'decorative', altText: '' });
  assert.equal(decorative.altText, '');
  assert.throws(() => validatePhotoProvenance({ ...base, semanticRole: 'decorative' }), /decorative photos require altText=""/);

  const functional = validatePhotoProvenance({ ...base, semanticRole: 'functional', altText: 'Open full-size studio photo' });
  assert.equal(functional.semanticRole, 'functional');
  assert.throws(
    () => validatePhotoProvenance({ ...base, semanticRole: 'functional', altText: 'A ceramicist in a studio' }),
    /describe the action/,
  );
});

test('content photos reject empty alt and unknown semantic roles', () => {
  assert.throws(() => validatePhotoProvenance({ ...base, semanticRole: 'content', altText: '' }), /content photo altText/);
  assert.throws(() => validatePhotoProvenance({ ...base, semanticRole: 'ambient' }), /semanticRole must be one of/);
});

test('a shipped photo needs a real source page, a safe local path, and descriptive alt text', () => {
  assert.throws(() => validatePhotoProvenance({ ...base, sourcePage: 'not-a-url' }), /sourcePage/);
  assert.throws(() => validatePhotoProvenance({ ...base, sourcePage: 'http://unsplash.com/x' }), /https/);
  assert.throws(() => validatePhotoProvenance({ ...base, localPath: '/etc/passwd' }), /project-relative/);
  assert.throws(() => validatePhotoProvenance({ ...base, localPath: '../secret.jpg' }), /project-relative/);
  assert.throws(() => validatePhotoProvenance({ ...base, altText: '' }), /content photo altText must describe the image/);
  assert.throws(() => validatePhotoProvenance({ ...base, altText: 'hero-portrait.jpg' }), /describe the image or action, not be a filename/);
  assert.throws(() => validatePhotoProvenance({ ...base, extra: 1 }), /unknown field/);
});
