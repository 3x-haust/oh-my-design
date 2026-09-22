import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { createTestProjectRunInvocation, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const fixture = (name: string): unknown => {
  const value: unknown = JSON.parse(readFileSync(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url), 'utf8'));
  return value;
};
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'omd-adaptive-source-seal-'));
  mkdirSync(join(directory, '.omd'), { recursive: true });
  mkdirSync(join(directory, 'src'), { recursive: true });
  writeFileSync(join(directory, 'src', 'app.ts'), 'export const current = true;\n');
  return realpathSync(directory);
}

function writeApprovedInput(directory: string, name: string): void {
  writeFileSync(join(directory, '.omd', name), `${name}: approved\n`);
}

function expressiveMedical(): unknown {
  const value = structuredClone(fixture('medical-new-product'));
  if (typeof value !== 'object' || value === null) throw new Error('medical fixture must be an object');
  const designAxes = Reflect.get(value, 'designAxes');
  const strategy = Reflect.get(value, 'strategyDecision');
  if (typeof designAxes !== 'object' || designAxes === null || typeof strategy !== 'object' || strategy === null) {
    throw new Error('medical fixture route fields are missing');
  }
  Reflect.set(designAxes, 'expressiveDesignNeed', 'showpiece');
  Reflect.set(strategy, 'roles', ['omd-framer', 'omd-scout', 'omd-writer', 'omd-typesetter', 'omd-composer', 'omd-sketch', 'omd-hand', 'omd-eye']);
  Reflect.set(strategy, 'stages', ['domain', 'frame', 'content-grain', 'scout', 'reference-board', 'reference-selection', 'safety-validation', 'art-direction', 'copy', 'type-proof', 'composition', 'candidate-generation', 'production', 'browser-evidence', 'independent-review']);
  Reflect.set(strategy, 'executionWaves', [
    { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
    { id: 'parallel-research-copy', mode: 'concurrent', roles: ['omd-scout', 'omd-writer'] },
    { id: 'type-proof', mode: 'concurrent', roles: ['omd-typesetter'] },
    { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
    { id: 'candidate', mode: 'concurrent', roles: ['omd-sketch'] },
    { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
    { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
  ]);
  const methods = Reflect.get(strategy, 'methods');
  const skips = Reflect.get(strategy, 'skips');
  if (!Array.isArray(methods) || !Array.isArray(skips)) throw new Error('medical fixture strategy lists are missing');
  Reflect.set(strategy, 'methods', [...methods, 'image-first-draft', 'motion-one', 'motion-ambition:award-level']);
  Reflect.set(strategy, 'attributionCategories', ['tokens', 'motion', 'composition']);
  const selected = new Set(['reference-selection', 'art-direction', 'type-proof', 'candidate-generation', 'image-first-draft', 'motion-one']);
  Reflect.set(strategy, 'skips', skips.filter((entry) => typeof entry === 'object' && entry !== null && !selected.has(String(Reflect.get(entry, 'id')))));
  return value;
}

function routeStage(seal: unknown, id: string): unknown {
  if (typeof seal !== 'object' || seal === null) return undefined;
  const route = Reflect.get(seal, 'route');
  if (typeof route !== 'object' || route === null) return undefined;
  const stages = Reflect.get(route, 'stages');
  if (!Array.isArray(stages)) return undefined;
  return stages.find((stage) => typeof stage === 'object' && stage !== null && Reflect.get(stage, 'id') === id);
}

test('copy-only adaptive sealing binds the exact authorized art-direction skip and requires no phantom design inputs', () => {
  const directory = root();
  try {
    writeApprovedInput(directory, 'copy-deck.md');
    const invocation = publishTestAdaptiveRoute(directory, fixture('copy-only'), 'copy-only-source-seal');
    writeSourceSeal(directory, invocation);
    assert.deepEqual(validateSourceSeal(directory, invocation), []);
    const seal: unknown = JSON.parse(readFileSync(join(directory, '.omd', 'source-seal.json'), 'utf8'));
    assert.deepEqual(Object.keys(Reflect.get(seal as object, 'inputs')), ['copyDeckSha256']);
    for (const path of ['art-direction.json', 'intent-current.json', 'reference-handoffs/composer.json', 'reference-handoffs/hand.json']) {
      assert.equal(existsSync(join(directory, '.omd', path)), false, `${path} must not be manufactured for source sealing`);
    }
    for (const [id, reason] of [
      ['art-direction', 'The approved visual direction is unchanged.'],
      ['type-proof', 'Typography is outside the requested copy correction.'],
      ['composition', 'The existing layout and visual system are unchanged.'],
    ] as const) {
      const stage = routeStage(seal, id);
      assert.ok(typeof stage === 'object' && stage !== null);
      assert.equal(Reflect.get(stage, 'status'), 'skipped');
      assert.equal(Reflect.get(stage, 'reason'), reason);
      assert.match(String(Reflect.get(stage, 'routeSha256')), /^[a-f0-9]{64}$/);
      assert.match(String(Reflect.get(stage, 'authoritySha256')), /^[a-f0-9]{64}$/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('adaptive sealing fails when the same skip route has no current host authority', () => {
  const directory = root();
  try {
    writeApprovedInput(directory, 'copy-deck.md');
    const invocation = publishTestAdaptiveRoute(directory, fixture('copy-only'), 'missing-skip-authority');
    rmSync(join(directory, '.omd', 'route-authorities'), { recursive: true, force: true });
    assert.throws(() => writeSourceSeal(directory, invocation), /ROUTE_AUTHORITY_REQUIRED/);
    assert.equal(validateSourceSeal(directory, invocation)[0]?.id, 'SOURCE-SEAL-MISSING');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('adaptive source validation rejects stale, forged, changed-reason, cross-project, and unrelated skips', () => {
  const directory = root();
  const other = root();
  try {
    writeApprovedInput(directory, 'copy-deck.md');
    const invocation = publishTestAdaptiveRoute(directory, fixture('copy-only'), 'skip-failure-matrix');
    writeSourceSeal(directory, invocation);
    const sealPath = join(directory, '.omd', 'source-seal.json');
    const original: unknown = JSON.parse(readFileSync(sealPath, 'utf8'));
    assert.ok(typeof original === 'object' && original !== null);

    for (const [label, mutate] of [
      ['forged authority digest', (seal: Record<string, unknown>) => {
        const stage = routeStage(seal, 'art-direction');
        if (typeof stage === 'object' && stage !== null) Reflect.set(stage, 'authoritySha256', 'f'.repeat(64));
      }],
      ['changed art-direction reason', (seal: Record<string, unknown>) => {
        const stage = routeStage(seal, 'art-direction');
        if (typeof stage === 'object' && stage !== null) Reflect.set(stage, 'reason', 'Caller-authored replacement reason.');
      }],
      ['unrelated type-proof skip substituted for art direction', (seal: Record<string, unknown>) => {
        const art = routeStage(seal, 'art-direction');
        const type = routeStage(seal, 'type-proof');
        if (typeof art === 'object' && art !== null && typeof type === 'object' && type !== null) {
          Reflect.set(art, 'reason', Reflect.get(type, 'reason'));
        }
      }],
    ] as const) {
      const changed = structuredClone(original) as Record<string, unknown>;
      mutate(changed);
      writeFileSync(sealPath, `${JSON.stringify(changed, null, 2)}\n`);
      assert.ok(validateSourceSeal(directory, invocation).some((finding) => finding.id === 'SOURCE-SEAL-STALE'), label);
    }

    writeFileSync(sealPath, `${JSON.stringify(original, null, 2)}\n`);
    // A DIFFERENT invocation of the same project still validates. Every CLI command is its own
    // invocation, so treating a fresh one as stale meant nothing could read its own seal — the
    // failing behavior this boundary was corrected for. What must still fail is ANOTHER project.
    const freshInvocation = createTestProjectRunInvocation(directory, 'different-current-run');
    assert.equal(validateSourceSeal(directory, freshInvocation).some((finding) => /authority|route/i.test(finding.message)), false);
    const crossProjectInvocation = createTestProjectRunInvocation(other, 'skip-failure-matrix');
    assert.ok(validateSourceSeal(directory, crossProjectInvocation).some((finding) => /authority|route/i.test(finding.message)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('adaptive source check rejects route pointer or route path swaps after sealing', () => {
  const directory = root();
  try {
    writeApprovedInput(directory, 'copy-deck.md');
    const invocation = publishTestAdaptiveRoute(directory, fixture('copy-only'), 'route-pointer-swap');
    writeSourceSeal(directory, invocation);
    const pointerPath = join(directory, '.omd', 'route.json');
    const original = readFileSync(pointerPath);
    writeFileSync(pointerPath, readFileSync(join(directory, '.omd', 'route-source.json')));
    assert.ok(validateSourceSeal(directory, invocation).some((finding) => finding.path === '.omd/route.json'));
    writeFileSync(pointerPath, original);
    writeFileSync(join(directory, '.omd', 'route.json'), JSON.stringify({ schema: 'adaptive-route-pointer-v1', record: `route-records/sha256-${sha256('swapped')}.json`, sha256: sha256('swapped') }));
    assert.ok(validateSourceSeal(directory, invocation).some((finding) => finding.path === '.omd/route.json'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('high-risk expressive medical route still requires its exact current art-direction decision', () => {
  const directory = root();
  try {
    for (const name of ['frame.md', 'scout.md', 'copy-deck.md', 'type-proof.md', 'composition.md']) writeApprovedInput(directory, name);
    const invocation = publishTestAdaptiveRoute(directory, expressiveMedical(), 'medical-expressive-source-seal');
    assert.throws(() => writeSourceSeal(directory, invocation), /ART_DIRECTION_DECISION_REQUIRED/);
    assert.equal(validateSourceSeal(directory, invocation)[0]?.id, 'SOURCE-SEAL-MISSING');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
