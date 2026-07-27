import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, readDeliveryReceipts, requireStage, resolveRunState } from '../core/stage/contract.ts';
import { evaluateStageBudget, readStageUsage, serializeStageUsage, STAGE_USAGE_LOG, STAGE_USAGE_SCHEMA, stageCosts } from '../core/stage/usage.ts';

// Stage state is the loop's answer to a run that died mid-stage or lost its context to compaction.
// Artifact presence is derived from disk; delivery is the single persisted fact, and a receipt
// stops counting the moment the contract's bytes change.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const PACK = fileURLToPath(new URL('../core', import.meta.url));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-stage-'));

function write(dir: string, relative: string, content: string): void {
  const path = join(dir, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

test('every stage names a real owner, artifact, and existing pack contract', () => {
  assert.ok(STAGES.length >= 10);
  assert.equal(new Set(STAGES.map((stage) => stage.id)).size, STAGES.length);
  for (const stage of STAGES) {
    assert.match(stage.artifact, /^\.omd\//);
    assert.ok(stage.requiredContracts.length > 0, `${stage.id} declares no contract`);
    for (const contract of stage.requiredContracts) {
      assert.doesNotThrow(() => readFileSync(join(PACK, contract)), `${stage.id} cites missing ${contract}`);
    }
  }
});

test('a stage is blocked until an earlier owner produced its artifact', () => {
  const dir = project();
  const blocked = run(['stage', 'require', 'frame', '--json'], dir);
  assert.equal(blocked.status, 1, blocked.stdout);
  const requirement = JSON.parse(blocked.stdout);
  assert.deepEqual(requirement.missingArtifacts, ['.omd/domain-brief.json', '.omd/depth.json']);

  write(dir, '.omd/domain-brief.json', '{}');
  write(dir, '.omd/depth.json', '{}');
  const stillBlocked = JSON.parse(run(['stage', 'require', 'frame', '--json'], dir).stdout);
  assert.deepEqual(stillBlocked.missingArtifacts, []);
  assert.deepEqual(stillBlocked.undeliveredContracts, ['protocol/human-design-loop.md', 'theory/ux.md']);
});

test('delivery unblocks a stage and an edited contract invalidates its receipt', () => {
  const dir = project();
  write(dir, '.omd/domain-brief.json', '{}');
  write(dir, '.omd/depth.json', '{}');
  for (const contract of ['protocol/human-design-loop.md', 'theory/ux.md']) {
    const delivered = run(['stage', 'deliver', '--stage', 'frame', '--contract', contract, '--json'], dir);
    assert.equal(delivered.status, 0, delivered.stderr);
    assert.equal(JSON.parse(delivered.stdout).stage, 'frame');
  }
  assert.equal(run(['stage', 'require', 'frame'], dir).status, 0);

  const receipts = readDeliveryReceipts(dir);
  assert.equal(receipts.length, 2);
  assert.ok(receipts.every((receipt) => /^[a-f0-9]{64}$/.test(receipt.sha256)));

  // A receipt binds exact bytes: pointing the pack at different content leaves the stage blocked.
  const stalePack = mkdtempSync(join(tmpdir(), 'omd-stage-pack-'));
  mkdirSync(join(stalePack, 'protocol'), { recursive: true });
  mkdirSync(join(stalePack, 'theory'), { recursive: true });
  writeFileSync(join(stalePack, 'protocol', 'human-design-loop.md'), 'edited protocol');
  writeFileSync(join(stalePack, 'theory', 'ux.md'), 'edited theory');
  const stale = requireStage(dir, stalePack, 'frame');
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.undeliveredContracts, ['protocol/human-design-loop.md', 'theory/ux.md']);
});

test('run state names the current stage and its blocking contracts after a partial run', () => {
  const dir = project();
  for (const [relative, body] of [
    ['.omd/domain-brief.json', '{}'],
    ['.omd/depth.json', '{}'],
    ['.omd/frame.md', '# frame'],
    ['.omd/acquisition-plan.json', '{}'],
    ['.omd/scout.md', '# scout'],
  ] as const) write(dir, relative, body);

  const state = resolveRunState(dir, PACK);
  assert.deepEqual(state.completed, ['domain', 'depth', 'frame', 'acquisition', 'scout']);
  assert.equal(state.current, 'reference-board');

  const resumed = JSON.parse(run(['stage', 'resume', '--json'], dir).stdout);
  assert.equal(resumed.current, 'reference-board');
  assert.deepEqual(resumed.blocked.undeliveredContracts, ['protocol/reference-assembly.md']);
});

test('the delivery log stays append-only across separate deliveries and rejects corrupt lines', () => {
  const dir = project();
  run(['stage', 'deliver', '--stage', 'domain', '--contract', 'protocol/domain-analysis.md'], dir);
  run(['stage', 'deliver', '--stage', 'depth', '--contract', 'protocol/design-deliberation.md'], dir);
  const log = readFileSync(join(dir, '.omd/delivery.jsonl'), 'utf8').trim().split('\n');
  assert.equal(log.length, 2);
  assert.deepEqual(readDeliveryReceipts(dir).map((receipt) => receipt.stage), ['domain', 'depth']);

  writeFileSync(join(dir, '.omd/delivery.jsonl'), `${log[0]}\nnot json\n`);
  assert.throws(() => readDeliveryReceipts(dir), /delivery log line 2 is not JSON/);
});

test('an unknown stage names the known stages instead of failing silently', () => {
  const dir = project();
  const unknown = run(['stage', 'require', 'polish'], dir);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown stage polish; known: domain, depth, frame/);
});

// Host logs only report a cumulative run total, so a stage's cost is the delta between the
// snapshot taken when it ended and the previous one. A rotated log moves the total backwards;
// that must degrade to an approximate figure rather than a negative one.

const sample = (stage: string, totalTokens: number, elapsedMs: number, approximate = false) => ({
  schema: STAGE_USAGE_SCHEMA, stage, at: new Date(elapsedMs).toISOString(),
  totalTokens, outputTokens: Math.round(totalTokens / 10), elapsedMs, approximate,
});

test('stage cost is the delta between cumulative snapshots', () => {
  const costs = stageCosts([
    sample('domain', 1_000, 60_000),
    sample('frame', 4_000, 300_000),
    sample('scout', 9_000, 900_000),
  ] as never);
  assert.deepEqual(costs.map((cost) => cost.totalTokens), [1_000, 3_000, 5_000]);
  assert.deepEqual(costs.map((cost) => cost.elapsedMs), [60_000, 240_000, 600_000]);
  assert.ok(costs.every((cost) => !cost.approximate));
});

test('a rotated host log yields an approximate cost instead of a negative one', () => {
  const costs = stageCosts([sample('domain', 9_000, 900_000), sample('frame', 500, 30_000)] as never);
  assert.equal(costs[1]!.totalTokens, 500);
  assert.equal(costs[1]!.approximate, true);
});

test('the budget names the stage that blew it and the run totals that did not', () => {
  const samples = [sample('domain', 1_000, 60_000), sample('frame', 400_000, 3_600_000)] as never;
  const overStage = evaluateStageBudget(samples, { maxStageTokens: 100_000 });
  assert.equal(overStage.ok, false);
  assert.match(overStage.findings[0]!, /stage frame used 399000 tokens over the 100000 stage budget/);

  const overRun = evaluateStageBudget(samples, { maxRunTokens: 200_000, maxRunElapsedMs: 30 * 60_000 });
  assert.equal(overRun.ok, false);
  assert.equal(overRun.findings.length, 2);
  assert.equal(evaluateStageBudget(samples, { maxRunTokens: 1_000_000 }).ok, true);
});

test('stage cost reads its log through the CLI and fails only over budget', () => {
  const dir = project();
  write(dir, STAGE_USAGE_LOG, serializeStageUsage([sample('domain', 1_000, 60_000), sample('frame', 50_000, 600_000)] as never));
  assert.equal(readStageUsage(dir).length, 2);

  const within = run(['stage', 'cost', '--json'], dir);
  assert.equal(within.status, 0, within.stderr);
  assert.equal(JSON.parse(within.stdout).runTokens, 50_000);

  const over = run(['stage', 'cost', '--max-stage-tokens', '10000', '--json'], dir);
  assert.equal(over.status, 1);
  assert.match(JSON.parse(over.stdout).findings[0], /stage frame used 49000 tokens/);
});

// Cues answer "which contract does this piece of work bind" from inputs a machine evaluates the
// same way twice. A cue that required interpretation would reintroduce the discipline gap it
// exists to close, so free-text intent is not a source.

test('every cue rule is unique, reasoned, and cites a contract that exists', async () => {
  const { CUE_RULES, validateCueRules } = await import('../core/stage/cues.ts');
  assert.doesNotThrow(() => validateCueRules());
  for (const rule of CUE_RULES) {
    for (const contract of rule.contracts) {
      assert.doesNotThrow(() => readFileSync(join(PACK, contract)), `${rule.match} cites missing ${contract}`);
    }
  }
  assert.ok(CUE_RULES.every((rule) => ['path', 'symbol', 'field'].includes(rule.source)), 'cue sources stay deterministic');
});

test('cues resolve from paths, symbols, and typed fields, and widen a stage obligation', async () => {
  const { resolveCues, cueContracts, stageContractsWithCues } = await import('../core/stage/cues.ts');
  const landing = resolveCues({ paths: ['src/landing/Hero.tsx'] });
  assert.deepEqual(cueContracts(landing), ['protocol/copy-deck.md', 'theory/craft.md']);
  assert.deepEqual(resolveCues({ paths: ['src/components/Hero.tsx'] }), []);

  assert.deepEqual(cueContracts(resolveCues({ symbols: ['Dialog'] })), ['theory/components.md', 'theory/ux.md']);
  assert.deepEqual(resolveCues({ symbols: ['DialogTrigger'] }), [], 'symbol cues match exactly, never by substring');

  const multi = resolveCues({ fields: { localization: 'multi-locale', motionDecision: 'none' } });
  assert.deepEqual(cueContracts(multi), ['protocol/locale-contract.md', 'theory/layout.md']);
  assert.deepEqual(resolveCues({ fields: { localization: 'single' } }), []);

  const widened = stageContractsWithCues('copy', multi);
  assert.deepEqual(widened, ['protocol/copy-deck.md', 'protocol/locale-contract.md', 'theory/layout.md', 'theory/voice.md']);
});

test('the cue CLI reports the bound contracts and their reasons', () => {
  const dir = project();
  const resolved = run(['cue', '--path', 'app/dashboard/page.tsx', '--symbol', 'form', '--json'], dir);
  assert.equal(resolved.status, 0, resolved.stderr);
  const result = JSON.parse(resolved.stdout);
  assert.deepEqual(result.contracts, ['theory/ux.md']);
  assert.equal(result.cues.length, 2);
  assert.ok(result.cues.every((cue: { reason: string }) => cue.reason.length > 0));

  const staged = JSON.parse(run(['cue', '--field', 'surface=marketing', '--stage', 'frame', '--json'], dir).stdout);
  assert.deepEqual(staged.contracts, ['protocol/human-design-loop.md', 'theory/craft.md', 'theory/ux.md']);
});
