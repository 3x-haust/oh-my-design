import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { parseRouteRecord } from '../core/route/adaptive-route-record.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { DESIGN_HANDOFF_PARTS, parseDesignHandoff, validateDesignHandoffArtifacts } from '../core/completion/design-handoff.ts';
import { STAGES } from '../core/stage/contract.ts';
import omdExtension, { type PortablePiTool } from '../extensions/omd.ts';

const fixture = () => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/design-only-test007.json', import.meta.url), 'utf8'));
const cliPath = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
const cli = (root: string, args: string[]) => spawnSync(process.execPath, [cliPath, ...args], { cwd: root, encoding: 'utf8', env, timeout: 20000 });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

test('test-007 design-only route persists its scope without requiring production or application evidence', () => {
  const route = routeAdaptiveFlow(fixture());
  assert.equal(route.deliveryMode, 'design-only');
  assert.ok(route.gates.includes('design-handoff'));
  assert.ok(route.gates.includes('dual-reference-research'));
  assert.ok(route.gates.includes('greenfield-task-flow-benchmark'));
  assert.equal(route.gates.includes('final-evidence-v2'), false);
  assert.equal(route.gates.includes('source-seal'), false);
  assert.deepEqual(parseRouteRecord(JSON.parse(JSON.stringify(route))), route);
  for (const change of [
    (v: ReturnType<typeof fixture>) => { v.allowedPaths.push('src/**'); },
    (v: ReturnType<typeof fixture>) => { v.strategyDecision.roles.push('omd-hand'); },
    (v: ReturnType<typeof fixture>) => { v.strategyDecision.stages.splice(-1, 0, 'production'); },
    (v: ReturnType<typeof fixture>) => { v.namedDependencies.push('react'); },
  ]) {
    const value = fixture(); change(value);
    assert.throws(() => routeAdaptiveFlow(value), /DESIGN_ONLY_SCOPE_REQUIRED/);
  }
  const implementation = fixture(); delete implementation.deliveryMode;
  assert.throws(() => routeAdaptiveFlow(implementation), /PRODUCTION_REQUIRED/);
  const forged = structuredClone(route); Reflect.deleteProperty(forged, 'deliveryMode');
  assert.throws(() => parseRouteRecord(forged));
});

test('test-007 malformed values explain the precise repair without relaxing the policy', () => {
  for (const kind of ['safety', 'recovery', 'accessibility']) {
    const value = fixture(); value.uxPolicy.decisions[1].kind = kind;
    assert.throws(() => routeAdaptiveFlow(value), /MALFORMED_POLICY: uxPolicy.decisions\[1\].kind must be/);
  }
  const value = fixture(); delete value.designAxes.schema;
  assert.throws(() => routeAdaptiveFlow(value), /designAxes requires schema/);
  const waves = fixture();
  waves.strategyDecision.executionWaves[2].roles.push('omd-composer');
  waves.strategyDecision.executionWaves.splice(3, 1);
  assert.throws(() => routeAdaptiveFlow(waves), /composition.*later execution wave than type-proof/);
  assert.doesNotThrow(() => routeAdaptiveFlow(inputSkeleton('design-route-input').skeleton));
});

test('real Pi extension validates, publishes, resumes and reads a design route without external activation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-pi-design-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd', '.cache'), { recursive: true });
  const path = '.omd/.cache/route-input.json';
  writeFileSync(join(root, path), JSON.stringify(fixture()));
  let tool!: PortablePiTool;
  omdExtension({
    registerCommand() {}, registerTool(value) { tool = value; },
    async exec(_command, args, options) {
      const result = spawnSync(process.execPath, [...args], { cwd: options.cwd, encoding: 'utf8', env, timeout: 20000 });
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
    },
  });
  const run = (args: string[]) => tool.execute('test', { args }, undefined, undefined, { cwd: root });
  const validated = await run(['route', 'validate', '--input', path, '--json']);
  assert.equal(JSON.parse(validated.content[0]!.text).published, false);
  assert.deepEqual(readdirSync(join(root, '.omd')), ['.cache']);
  await run(['route', 'classify', '--input', path, '--json']);
  const shown = await run(['route', 'show', '--json']);
  assert.equal(JSON.parse(shown.content[0]!.text).deliveryMode, 'design-only');
  await run(['route', 'check', '--json']);
  await run(['stage', 'resume']);
  await run(['ref', 'discover-plan', '--json']);
  const reviewBrief = JSON.parse((await run(['brief', 'independent-review', '--json'])).content[0]!.text);
  assert.equal(reviewBrief.route.deliveryMode, 'design-only');
  assert.ok(reviewBrief.judgedBy.some((check: { command: string }) => check.command.includes('completion design-check')));
  assert.ok(!reviewBrief.judgedBy.some((check: { command: string }) => check.command.includes('omd check <page>')));
  assert.equal(existsSync(join(root, 'src')), false);
  const missingHandoff = cli(root, ['completion', 'design-check', '--input', '.omd/design-handoff.json']);
  assert.notEqual(missingHandoff.status, 0);
  writeFileSync(join(root, 'app.tsx'), 'export const App = () => null;');
  assert.notEqual(cli(root, ['route', 'check', '--json']).status, 0);
});

test('design handoff rejects stale documents, omitted parts, absent selected outputs and fabricated completion', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-design-handoff-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd', 'design'), { recursive: true });
  // Existing copy-only evidence does not select discovery; its design-only equivalent still needs every document.
  const value = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  value.deliveryMode = 'design-only'; value.allowedPaths = ['.omd/**'];
  value.strategyDecision.roles = value.strategyDecision.roles.filter((r: string) => r !== 'omd-hand');
  value.strategyDecision.stages = value.strategyDecision.stages.filter((r: string) => !['production', 'browser-evidence'].includes(r));
  value.strategyDecision.executionWaves = value.strategyDecision.executionWaves.filter((w: { roles: string[] }) => !w.roles.includes('omd-hand'));
  value.strategyDecision.methods = value.strategyDecision.methods.filter((m: string) => !['reuse-linked-browser-evidence', 'decision-linked-browser-observation'].includes(m));
  value.strategyDecision.methods.push('design-handoff-review');
  const route = routeAdaptiveFlow(value);
  const document = (id: string) => {
    const path = `.omd/design/${id}.md`; const text = `# ${id}\nTask-specific design decisions and known limitations.\n`;
    writeFileSync(join(root, path), text); return { path, sha256: digest(text) };
  };
  const handoff = { schema: 'design-handoff-v1', sourceContractSha256: route.sourceContractSha256, artifacts: DESIGN_HANDOFF_PARTS.map(id => ({ id, ...document(id) })), review: document('review') };
  assert.throws(() => validateDesignHandoffArtifacts(root, route, handoff));
  for (const stage of STAGES.filter(stage => route.strategy.stages.includes(stage.id))) writeFileSync(join(root, stage.artifact), 'Selected stage evidence.');
  const checked = validateDesignHandoffArtifacts(root, route, handoff);
  assert.equal(checked.implementation, 'not-performed');
  assert.equal(checked.review.independence, 'not-attested');
  assert.throws(() => parseDesignHandoff({ ...handoff, artifacts: handoff.artifacts.slice(1) }));
  writeFileSync(join(root, handoff.artifacts[0]!.path), 'changed');
  assert.throws(() => validateDesignHandoffArtifacts(root, route, handoff), /stale document/);
});
