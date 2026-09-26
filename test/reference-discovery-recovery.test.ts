import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseDiscoveryBatchInput } from '../core/ref/discovery-batch.ts';
import { expandedDiscoveryInputs, requireNovelRecoveryBatch } from '../core/ref/discovery-recovery.ts';
import { buildReferenceDiscoveryPlan } from '../core/ref/discovery-plan.ts';
import { isMarketQualifiedQuery } from '../core/ref/market-reference.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { routeInput } from './helpers/discovery-work.ts';
import { directRootAt } from './helpers/market-reference.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

function fixture(t: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-discovery-recovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const receipt = testSearchReceipt(root, 'design', '한국 신청 UI', [], true);
  const target = join(root, '.omd/discovery/design', `search-${receipt.sha256}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(join(root, receipt.path)));
  return root;
}
const search = (query: string, provider = 'www.google.com') => ({ kind: 'search', input: {
  lane: 'design', query, url: `https://${provider}/search?q=${encodeURIComponent(query)}`, queryParam: 'q',
} });

test('design recovery searches concrete pattern seeds before repeating the narrow product category', t => {
  const root = fixture(t);
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(routeInput()));
  const broadened = { ...plan, lanes: plan.lanes.map(lane => lane.id === 'design-reference'
    ? { ...lane, querySeeds: [...lane.querySeeds, 'document checklist', 'progress tracker'] } : lane) };
  const inputs = expandedDiscoveryInputs(broadened, 'design');
  assert.match(inputs[0]?.query ?? '', /document checklist/u);
  assert.ok(inputs.some(input => /progress tracker/u.test(input.query)));
  assert.ok(inputs.every(input => isMarketQualifiedQuery(input.query, plan.marketReferencePolicy.marketSearchLabels)
    && input.query.includes('site:')));
});

test('recovery refuses repeated searches before CLI authorization or browser work, including equivalent encoding', t => {
  const root = fixture(t);
  const items = parseDiscoveryBatchInput([search('한국 신청 UI')]);
  assert.throws(() => requireNovelRecoveryBatch(root, items), /REFERENCE_RECOVERY_REPEATED_REQUEST/);
  const manifest = join(root, 'recovery.json');
  writeFileSync(manifest, JSON.stringify([search('한국 신청 UI')]));
  const before = readdirSync(join(root, '.omd'), { recursive: true }).sort();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/omd.ts', import.meta.url)),
    'ref', 'discover-batch', '--input', manifest, '--json', '--recovery'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFERENCE_RECOVERY_REPEATED_REQUEST/);
  assert.deepEqual(readdirSync(join(root, '.omd'), { recursive: true }).sort(), before);
  assert.doesNotThrow(() => requireNovelRecoveryBatch(root, parseDiscoveryBatchInput([search('한국 서류 준비 UI')])));
  assert.doesNotThrow(() => requireNovelRecoveryBatch(root, parseDiscoveryBatchInput([search('한국 신청 UI', 'www.bing.com')])));
});

test('recovery cannot relabel a visited entry as navigation to count it again', t => {
  const root = fixture(t);
  const source = 'https://www.siteinspire.com/';
  directRootAt(root, 'design', source, ['https://www.siteinspire.com/websites/123-task-ui']);
  assert.throws(() => requireNovelRecoveryBatch(root, parseDiscoveryBatchInput([
    { kind: 'navigate', source, lane: 'design' },
  ])), /REFERENCE_RECOVERY_REPEATED_REQUEST/);
  assert.doesNotThrow(() => requireNovelRecoveryBatch(root, parseDiscoveryBatchInput([
    { kind: 'navigate', source: 'https://www.siteinspire.com/websites/123-task-ui', lane: 'design' },
  ])));
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});
