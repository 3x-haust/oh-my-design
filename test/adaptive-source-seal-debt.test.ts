import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confidenceDebt, CONFIDENCE_DEBT_PATH, recordConfidenceDebt } from '../core/brief/confidence-debt.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { createAdaptiveSourceSealRoute, isAdaptiveSourceSealRoute, type AdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { validateSourceSeal, validateSourceSealArtifact, writeSourceSeal } from '../core/source-seal/index.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const snapshot = (root: string) => readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
  .map(entry => { const path = join(entry.parentPath, entry.name); return [path, hash(readFileSync(path))]; }).sort();
function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-preliminary-seal-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, input);
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><body><main>Patch instrument study</main></body></html>');
  const binding = () => `## Production revision binding\n- Production entry: \`index.html\`\n- Production revision SHA-256: \`${servedProjectTreeSha256(root, 'index.html')}\`\n`;
  writeFileSync(join(root, '.omd/composition.md'), binding());
  const route = readPersistedRoute(root, invocation);
  const debt = () => recordConfidenceDebt(root, route.sourceContractSha256,
    ['art-direction', 'copy', 'type-proof'].map(stage => confidenceDebt(stage, `${stage} has not completed before first render.`)), invocation);
  return { root, invocation, route, binding, debt };
}

test('selected missing inputs with current debt seal through the real CLI without fabricated artifacts', t => {
  const f = fixture(t), items = f.debt();
  const cli = spawnSync(process.execPath, [join(import.meta.dirname, '../bin/omd.mjs'), 'source', '--seal', '--json'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.deepEqual(validateSourceSeal(f.root, f.invocation), []);
  const seal = validateSourceSealArtifact(JSON.parse(readFileSync(join(f.root, '.omd/source-seal.json'), 'utf8')));
  assert.ok(seal.route);
  assert.deepEqual(Object.keys(seal.inputs).sort(), ['compositionSha256', 'confidenceDebtSha256']);
  assert.equal(seal.inputs.confidenceDebtSha256, hash(readFileSync(join(f.root, CONFIDENCE_DEBT_PATH))));
  for (const id of ['art-direction', 'copy', 'type-proof']) {
    const selected: AdaptiveSourceSealRoute['stages'][number] | undefined = seal.route.stages.find(binding => binding.id === id);
    assert.ok(selected?.status === 'selected');
    assert.deepEqual(selected.artifacts, []);
    assert.equal(selected.confidenceDebt?.claim, 'not-verified');
    assert.deepEqual(selected.confidenceDebt?.itemIds, items.filter(item => item.stage === id).map(item => item.id));
  }
  for (const path of ['art-direction.json', 'copy-deck.md', 'type-proof.md']) assert.equal(existsSync(join(f.root, '.omd', path)), false);
});

test('missing, wrong-stage, wrong-source and malformed debt refuse before mutation', t => {
  for (const invalid of ['absent', 'wrong-stage', 'wrong-source', 'malformed']) {
    const f = fixture(t);
    if (invalid === 'wrong-stage') recordConfidenceDebt(f.root, f.route.sourceContractSha256, [confidenceDebt('reference-board', 'No board yet.')], f.invocation);
    if (invalid === 'wrong-source') recordConfidenceDebt(f.root, 'a'.repeat(64), [confidenceDebt('art-direction', 'Other task.')], f.invocation);
    if (invalid === 'malformed') writeFileSync(join(f.root, CONFIDENCE_DEBT_PATH), '{}');
    const before = snapshot(f.root);
    assert.throws(() => writeSourceSeal(f.root, f.invocation));
    assert.deepEqual(snapshot(f.root), before, invalid);
  }
});

test('existing malformed art direction and dangling copy symlinks cannot be waived by debt', t => {
  for (const invalid of ['art-direction', 'copy-symlink']) {
    const f = fixture(t); f.debt(); writeSourceSeal(f.root, f.invocation);
    if (invalid === 'art-direction') writeFileSync(join(f.root, '.omd/art-direction.json'), '{}');
    else symlinkSync(join(f.root, '.omd/nonexistent.md'), join(f.root, '.omd/copy-deck.md'));
    const before = snapshot(f.root);
    assert.throws(() => writeSourceSeal(f.root, f.invocation));
    assert.deepEqual(snapshot(f.root), before);
    assert.ok(validateSourceSeal(f.root, f.invocation).length > 0);
  }
});

test('materialized artifacts replace debt bindings and retain byte/revision staleness checks', t => {
  const f = fixture(t); f.debt(); writeSourceSeal(f.root, f.invocation);
  writeFileSync(join(f.root, '.omd/copy-deck.md'), 'Current authored copy.');
  assert.ok(validateSourceSeal(f.root, f.invocation).length > 0);
  writeSourceSeal(f.root, f.invocation);
  const stage = createAdaptiveSourceSealRoute(f.root, f.invocation).stages.find(stage => stage.id === 'copy')!;
  assert.ok(stage.status === 'selected');
  assert.equal(stage.confidenceDebt, undefined);
  assert.equal(stage.artifacts[0]?.sha256, hash('Current authored copy.'));
  writeFileSync(join(f.root, '.omd/copy-deck.md'), 'Changed authored copy.');
  assert.ok(validateSourceSeal(f.root, f.invocation).length > 0);
  writeFileSync(join(f.root, '.omd/type-proof.md'), 'Unbound proof.');
  const before = snapshot(f.root);
  assert.throws(() => writeSourceSeal(f.root, f.invocation), /SOURCE_BOUND_PROOF/);
  assert.deepEqual(snapshot(f.root), before);
  writeFileSync(join(f.root, '.omd/type-proof.md'), f.binding());
  writeSourceSeal(f.root, f.invocation);
  assert.deepEqual(validateSourceSeal(f.root, f.invocation), []);
  writeFileSync(join(f.root, 'index.html'), '<main>Changed production</main>');
  assert.throws(() => writeSourceSeal(f.root, f.invocation), /SOURCE_BOUND_PROOF/);
});

test('ledger changes invalidate preliminary seals, while composition cannot be deferred', t => {
  const f = fixture(t); f.debt(); writeSourceSeal(f.root, f.invocation);
  recordConfidenceDebt(f.root, f.route.sourceContractSha256, [confidenceDebt('reference-board', 'No research comparison.')], f.invocation);
  assert.ok(validateSourceSeal(f.root, f.invocation).length > 0);
  recordConfidenceDebt(f.root, f.route.sourceContractSha256, [confidenceDebt('composition', 'Full composition extras are absent.')], f.invocation);
  unlinkSync(join(f.root, '.omd/composition.md'));
  const before = snapshot(f.root);
  assert.throws(() => writeSourceSeal(f.root, f.invocation));
  assert.deepEqual(snapshot(f.root), before);
});

test('debt binding schema rejects disguised artifacts, empty identities and contradictory ledger hashes', t => {
  const f = fixture(t); f.debt();
  const route = createAdaptiveSourceSealRoute(f.root, f.invocation);
  assert.equal(isAdaptiveSourceSealRoute(route), true);
  const selected = route.stages[0]!;
  assert.ok(selected.status === 'selected' && selected.confidenceDebt);
  const malformed = [
    { id: selected.id, status: 'selected', artifacts: [] },
    { ...selected, artifacts: [{ path: '.omd/art-direction.json', sha256: 'a'.repeat(64) }] },
    { ...selected, confidenceDebt: { ...selected.confidenceDebt, itemIds: [] } },
    { ...selected, confidenceDebt: { ...selected.confidenceDebt, claim: 'verified' } },
    { ...selected, confidenceDebt: { ...selected.confidenceDebt, record: { ...selected.confidenceDebt.record, sha256: 'a'.repeat(64) } } },
  ];
  for (const invalid of malformed) assert.equal(isAdaptiveSourceSealRoute({ ...route, stages: [invalid, ...route.stages.slice(1)] }), false);
});
