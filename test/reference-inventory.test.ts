import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { designAdmissionFixture } from './helpers/design-admission.ts';

test('ref list keeps archival inspection but labels ineligible design records instead of promoting them', t => {
  const fixture = designAdmissionFixture(t);
  fixture.capture('https://www.benefits.gov/', 'legacy-benefits', 'design', 8);
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  const output = execFileSync(process.execPath, [cli, 'ref', 'list', '--lane', 'design', '--json'], { cwd: fixture.root, env, encoding: 'utf8' });
  const refs: Array<{ component: string; admission?: { eligible: boolean; code: string } }> = JSON.parse(output);
  assert.equal(refs.find(ref => ref.component === 'legacy-benefits')?.admission?.eligible, false);
  assert.equal(refs.find(ref => ref.component === 'gallery')?.admission?.eligible, true);
  assert.equal(refs.find(ref => ref.component === 'hero')?.admission?.code, 'observed-original');
  assert.equal(refs.some(ref => ref.component === 'domain'), false);
});
