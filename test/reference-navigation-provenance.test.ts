import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { readCurrentReferenceDiscoveryEvidence } from '../core/ref/discovery-evidence.ts';
import { observedGalleryItems } from '../core/ref/gallery-evidence.ts';
import { DISCOVERY_LIMITATIONS, discoveryDigest } from '../core/ref/discovery-record.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { testPng } from './helpers/search-execution.ts';

const GALLERY_ITEM = 'https://www.siteinspire.com/website/123-example';
const ORIGINAL = 'https://original.example/';
type NavigationSchema = 'reference-navigation-capture-v2' | 'reference-navigation-capture-v3' | 'reference-navigation-capture-v4';

function fixture(t: { after(fn: () => void): void }): Readonly<{ root: string; route: string; publishedAt: number }> {
  const root = mkdtempSync(join(tmpdir(), 'omd-navigation-provenance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const route = join(root, '.omd/route.json');
  writeFileSync(route, '{}');
  const publishedAt = Date.now() - 60_000;
  utimesSync(route, new Date(publishedAt), new Date(publishedAt));
  return { root, route, publishedAt };
}

function navigation(root: string, schema: NavigationSchema, capturedAt: number,
  links: readonly string[] = [ORIGINAL], providedSignature?: string): string | undefined {
  const directory = '.omd/discovery/design/navigation';
  mkdirSync(join(root, directory), { recursive: true });
  const image = testPng();
  const imageSha256 = discoveryDigest(image);
  writeFileSync(join(root, directory, `${imageSha256}.png`), image);
  const unsigned = {
    schema, source: GALLERY_ITEM, researchLane: 'design', kind: 'page',
    capturedAt: new Date(capturedAt).toISOString(), imagePath: `${directory}/${imageSha256}.png`,
    acquisition: { requestedUrl: GALLERY_ITEM, finalUrl: GALLERY_ITEM, httpStatus: 200,
      links, imageSha256 }, limitations: DISCOVERY_LIMITATIONS,
  } as const;
  const signature = schema === 'reference-navigation-capture-v3' || schema === 'reference-navigation-capture-v4'
    ? providedSignature ?? signNativeObservation(root, schema, discoveryDigest(canonicalJson(unsigned))) : undefined;
  const record = signature === undefined ? unsigned : { ...unsigned, signature };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(root, directory, `${discoveryDigest(bytes)}.json`), bytes);
  return signature;
}

test('current discovery rejects a self-hashed unsigned navigation visit', t => {
  // Given a current route and a self-hashed legacy capture.
  const { root } = fixture(t);
  navigation(root, 'reference-navigation-capture-v2', Date.now());
  // When current discovery evidence is read.
  const evidence = readCurrentReferenceDiscoveryEvidence(root);
  // Then the visit cannot enter the current lane.
  assert.deepEqual(evidence.design.visits, []);
});

test('gallery admission rejects a self-hashed unsigned navigation visit', t => {
  // Given a self-hashed legacy gallery item visit.
  const { root } = fixture(t);
  navigation(root, 'reference-navigation-capture-v2', Date.now());
  // When gallery originals are enumerated.
  const items = observedGalleryItems(root);
  // Then its original link has no authority.
  assert.deepEqual(items, []);
});

test('gallery admission rejects rehashed links with a mismatched native signature', t => {
  // Given a valid visit and a second self-hashed record carrying altered links with its signature.
  const { root } = fixture(t);
  const capturedAt = Date.now();
  const signature = navigation(root, 'reference-navigation-capture-v4', capturedAt);
  navigation(root, 'reference-navigation-capture-v4', capturedAt, ['https://forged.example/'], signature);
  // When gallery originals are enumerated.
  const items = observedGalleryItems(root);
  // Then only the original signed link survives.
  assert.deepEqual(items.map(item => item.links), [[ORIGINAL]]);
});

test('a signed current navigation visit supplies discovery and gallery originals', t => {
  // Given a current signed gallery item visit.
  const { root } = fixture(t);
  navigation(root, 'reference-navigation-capture-v4', Date.now());
  // When current discovery and gallery evidence are read.
  const evidence = readCurrentReferenceDiscoveryEvidence(root);
  const items = observedGalleryItems(root);
  // Then the signed visit and its observed original are available.
  assert.equal(evidence.design.visits[0]?.observation.url, GALLERY_ITEM);
  assert.deepEqual(items.map(item => item.links), [[ORIGINAL]]);
});

test('gallery admission expires a signed visit before the current route', t => {
  // Given a signed gallery visit preceding route publication.
  const { root, publishedAt } = fixture(t);
  navigation(root, 'reference-navigation-capture-v4', publishedAt - 1000);
  // When gallery originals are enumerated.
  const items = observedGalleryItems(root);
  // Then the earlier visit does not authorize an original.
  assert.deepEqual(items, []);
});

test('gallery admission expires a signed visit after seven days', t => {
  // Given a route and signed gallery visit older than seven days.
  const { root, route } = fixture(t);
  const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
  utimesSync(route, new Date(old - 1000), new Date(old - 1000));
  navigation(root, 'reference-navigation-capture-v4', old);
  // When gallery originals are enumerated.
  const items = observedGalleryItems(root);
  // Then the stale visit does not authorize an original.
  assert.deepEqual(items, []);
});

test('a signed v3 visit remains historical but cannot authorize current gallery originals', t => {
  const { root } = fixture(t);
  navigation(root, 'reference-navigation-capture-v3', Date.now());
  assert.deepEqual(readCurrentReferenceDiscoveryEvidence(root).design.visits, []);
  assert.deepEqual(observedGalleryItems(root), []);
});
