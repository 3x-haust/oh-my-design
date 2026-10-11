import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { confidenceDebt, recordConfidenceDebt } from '../core/brief/confidence-debt.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
function fixture(t: { after(fn: () => void): void }, copyExists = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-continuation-debt-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, input), routeRecord = readPersistedRoute(root, invocation);
  writeFileSync(join(root, 'index.html'), '<!doctype html><main>Patch instrument study</main>');
  const binding = `## Production revision binding\n- Production entry: \`index.html\`\n- Production revision SHA-256: \`${servedProjectTreeSha256(root, 'index.html')}\`\n`;
  writeFileSync(join(root, '.omd/composition.md'), binding);
  if (copyExists) writeFileSync(join(root, '.omd/copy-deck.md'), 'Original approved copy.');
  recordConfidenceDebt(root, routeRecord.sourceContractSha256, ['art-direction', 'copy', 'type-proof'].map(stage => confidenceDebt(stage, `${stage} is selected and remains unverified.`)), invocation);
  writeSourceSeal(root, invocation);
  return { root, invocation, routeRecord, route: createAdaptiveSourceSealRoute(root, invocation), binding };
}
test('unchanged continuation debt and retained artifacts validate without rewriting a seal', t => {
  const f = fixture(t, true), before = readFileSync(join(f.root, '.omd/source-seal.json'));
  assert.deepEqual(validateSourceSeal(f.root, undefined, f.route), []);
  assert.deepEqual(readFileSync(join(f.root, '.omd/source-seal.json')), before);
});
test('continuation rereads the confidence-debt receipt instead of trusting its supplied digest', t => {
  const f = fixture(t);
  recordConfidenceDebt(f.root, f.routeRecord.sourceContractSha256, [confidenceDebt('reference-board', 'Reference comparison remains unavailable.')], f.invocation);
  const before = readFileSync(join(f.root, '.omd/source-seal.json'));
  assert.ok(validateSourceSeal(f.root, undefined, f.route).some(f => f.id === 'SOURCE-SEAL-STALE' && f.message.includes('confidence-debt.json')));
  assert.deepEqual(readFileSync(join(f.root, '.omd/source-seal.json')), before);
});
for (const path of ['.omd/art-direction.json', '.omd/copy-deck.md', '.omd/type-proof.md']) test(`continuation refuses a newly materialized selected artifact: ${path}`, t => {
  const f = fixture(t);
  writeFileSync(join(f.root, path), path.endsWith('.json') ? '{}' : f.binding);
  const before = readFileSync(join(f.root, '.omd/source-seal.json'));
  assert.ok(validateSourceSeal(f.root, undefined, f.route).some(f => f.id === 'SOURCE-SEAL-STALE' && f.message.includes('materialized')));
  assert.deepEqual(readFileSync(join(f.root, '.omd/source-seal.json')), before);
});
test('continuation rehashes previously selected copy artifacts', t => {
  const f = fixture(t, true);
  writeFileSync(join(f.root, '.omd/copy-deck.md'), 'Changed after source seal.');
  assert.ok(validateSourceSeal(f.root, undefined, f.route).some(f => f.id === 'SOURCE-SEAL-STALE' && f.message.includes('copy-deck.md')));
});
