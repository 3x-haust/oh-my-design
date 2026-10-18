import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import type { VisualMeasurement } from '../core/measure/types.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';

async function measureFragment(t: TestContext, fragment: string): Promise<VisualMeasurement> {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const html = fixture.html.toString().replace('<h1>', `${fragment}<h1>`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  return loadMeasurement(fixture.root, result.packet);
}

test('computed form names warn when missing and accept native or ARIA names', async t => {
  const bad = await measureFragment(t, '<input id="unnamed">');
  const missing = bad.findings.filter(finding => finding.code === 'FORM_ACCESSIBLE_NAME_MISSING');
  assert.ok(missing.length > 0);
  assert.ok(missing.every(finding => finding.severity === 'advisory' && finding.basis === 'accessibility'));

  const good = await measureFragment(t, [
    '<label for="email">Email</label><input id="email">',
    '<label>Phone<input id="phone"></label>',
    '<input id="search" aria-label="Search">',
    '<span id="account-label">Account</span><input id="account" aria-labelledby="account-label">',
  ].join(''));
  assert.equal(good.findings.some(finding => finding.code === 'FORM_ACCESSIBLE_NAME_MISSING'), false);
});

test('placeholder-only fields warn while labelled placeholders remain valid', async t => {
  const bad = await measureFragment(t, '<input id="search" placeholder="Search">');
  const placeholder = bad.findings.filter(finding => finding.code === 'FORM_PLACEHOLDER_ONLY_LABEL');
  assert.ok(placeholder.length > 0);
  assert.ok(placeholder.every(finding => finding.severity === 'advisory' && finding.basis === 'accessibility'));

  const good = await measureFragment(t,
    '<label for="query">Search</label><input id="query" placeholder="Name or order number">');
  assert.equal(good.findings.some(finding => finding.code === 'FORM_PLACEHOLDER_ONLY_LABEL'), false);
});

test('Korean body tracking warns at 0.05em and ignores lower or Latin tracking', async t => {
  const bad = await measureFragment(t,
    '<p lang="ko" style="font-size:16px;letter-spacing:.8px">결제 내역을 확인하고 다음 작업을 선택하세요.</p>');
  const tracking = bad.findings.filter(finding => finding.code === 'KOREAN_BODY_TRACKING');
  assert.ok(tracking.length > 0);
  assert.ok(tracking.every(finding => finding.severity === 'advisory' && finding.basis === 'heuristic'));

  const good = await measureFragment(t, [
    '<p lang="ko" style="font-size:16px;letter-spacing:.79px">결제 내역을 확인하세요.</p>',
    '<p lang="en" style="font-size:16px;letter-spacing:.8px">TRACKED LATIN LABEL</p>',
  ].join(''));
  assert.equal(good.findings.some(finding => finding.code === 'KOREAN_BODY_TRACKING'), false);
});
