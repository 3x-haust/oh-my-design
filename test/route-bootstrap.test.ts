import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { routeAdaptiveFlow, diagnoseAdaptiveRouteInput } from '../core/route/adaptive-flow.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import omdExtension, { type PortablePiApi, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { classificationAllowsInputRepair, routeInputFailure, routeValidationArgs } from '../extensions/omd-route-bootstrap.ts';

const fixture = () => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/bootstrap-test013.json', import.meta.url), 'utf8'));
const inputPath = '.omd/.cache/route-input.json';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '실행 계획 오류로 중단했습니다.' }] };
const failureReport = (codes = ['REFERENCE_WORK_MISMATCH']) => JSON.stringify({ schema: 'adaptive-route-validation-v1', ok: false, published: false,
  diagnostics: codes.map(code => ({ path: 'strategyDecision.methods', code, message: `${code}: missing required input` })) });
const successReport = JSON.stringify({ schema: 'adaptive-route-validation-v1', ok: true, published: false, diagnostics: [] });

function repair(value: ReturnType<typeof fixture>) {
  value.strategyDecision.methods.push('parallel-reference-acquisition', 'hypothesis-validation');
  value.strategyDecision.executionWaves.find((w: { roles: string[] }) => w.roles.includes('omd-scout')).roles.push('omd-writer');
  value.strategyDecision.executionWaves = value.strategyDecision.executionWaves.filter((w: { id: string }) => w.id !== 'writer');
}

function harness(cwd: string, exec?: PortablePiApi['exec']) {
  const hooks = new Map<string, PortablePiHook>();
  const calls: string[][] = [];
  const sent: Array<Parameters<NonNullable<PortablePiApi['sendMessage']>>> = [];
  let tool!: PortablePiTool;
  let writeSequence = 0;
  omdExtension({
    on: (name, hook) => { hooks.set(name, hook); },
    registerTool: value => { tool = value; }, registerCommand() {},
    sendMessage: (...args) => { sent.push(args); },
    async exec(command, args, options) {
      calls.push(args.slice(1));
      if (exec) return exec(command, args, options);
      const result = spawnSync(process.execPath, [...args], { cwd: options.cwd, encoding: 'utf8', env, timeout: 20000 });
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
    },
  });
  const emit = (name: string, event: Parameters<PortablePiHook>[0], signal?: AbortSignal) => hooks.get(name)!(event, { cwd, ...(signal ? { signal } : {}) });
  return { calls, sent, emit,
    async run(args: string[]) {
      await emit('tool_call', { toolName: 'omd_cli', input: { args } });
      return tool.execute('test', { args }, undefined, undefined, { cwd });
    },
    async author(value = fixture()) {
      const toolCallId = `route-input-${++writeSequence}`;
      assert.equal(await emit('tool_call', { toolName: 'write', toolCallId, input: { path: inputPath, content: JSON.stringify(value) } }), undefined);
      mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
      writeFileSync(join(cwd, inputPath), JSON.stringify(value));
      await emit('tool_result', { toolName: 'write', toolCallId, input: { path: inputPath }, isError: false });
    },
    async end() { return await emit('message_end', { message: final }) as { message: typeof final }; },
  };
}

test('sanitized test-013 input reports all three linked blockers without editing or weakening the input', () => {
  const input = fixture(); const before = JSON.stringify(input);
  const diagnostics = diagnoseAdaptiveRouteInput(input);
  assert.deepEqual(new Set(diagnostics.map(d => d.code)), new Set(['REFERENCE_WORK_MISMATCH', 'REQUIRED_METHOD_MISSING', 'ADAPTIVE_EXECUTION_WAVE_INVALID']));
  assert.match(diagnostics.map(d => d.message).join('\n'), /parallel-reference-acquisition/);
  assert.match(diagnostics.map(d => d.message).join('\n'), /hypothesis-validation/);
  assert.match(diagnostics.map(d => d.message).join('\n'), /same execution wave/);
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => routeAdaptiveFlow(input), /REFERENCE_WORK_MISMATCH:.*parallel-reference-acquisition/);
  repair(input);
  assert.deepEqual(diagnoseAdaptiveRouteInput(input), []);
  const record = routeAdaptiveFlow(input);
  assert.ok(record.gates.includes('dual-reference-research'));
  assert.ok(record.gates.includes('greenfield-task-flow-benchmark'));
  assert.equal(record.sourceContract.designAxes.failureRisk, 'high');
  assert.ok(record.strategy.stages.includes('copy'));
});

test('every route starter has consistent prerequisites; examples do not waive real high-risk safety', () => {
  for (const name of ['route-input', 'product-route-input', 'design-route-input']) {
    const input = structuredClone(inputSkeleton(name).skeleton) as ReturnType<typeof fixture>;
    if (name === 'route-input') input.projectMode = 'existing';
    assert.deepEqual(diagnoseAdaptiveRouteInput(input), [], name);
    assert.doesNotThrow(() => routeAdaptiveFlow(input), name);
    input.designAxes.failureRisk = 'high'; input.designAxes.uxNeed = 'rigorous';
    assert.ok(diagnoseAdaptiveRouteInput(input).some(d => d.code === 'SAFETY_WORK_REQUIRED'), name);
    assert.throws(() => routeAdaptiveFlow(input), /SAFETY_WORK_REQUIRED/, name);
  }
});

test('wave parsing explains accepted mode and sequential-host semantics without accepting invented enums', () => {
  for (const mode of ['sequential', 'parallel', null]) {
    const input = fixture(); input.strategyDecision.executionWaves[0].mode = mode;
    const diagnostics = diagnoseAdaptiveRouteInput(input);
    assert.equal(diagnostics[0]!.code, 'ADAPTIVE_EXECUTION_WAVE_INVALID');
    assert.match(diagnostics[0]!.message, /executionWaves\[0\].mode must be "concurrent".*array order/);
    assert.throws(() => routeAdaptiveFlow(input), /ADAPTIVE_EXECUTION_WAVE_INVALID/);
  }
});

test('real Pi setup: reject, diagnose, bounded repair, validate, classify and enter first stage; production still refuses missing design', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-test013-bootstrap-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const h = harness(cwd);
  await h.emit('before_agent_start', { prompt: '/skill:omd-ultradesign Implement a React product' });
  const input = fixture(); await h.author(input);
  await assert.rejects(h.run(['route', 'validate', '--input', inputPath, '--json']), /REFERENCE_WORK_MISMATCH/);
  assert.deepEqual(readdirSync(join(cwd, '.omd')), ['.cache']); // validation writes no activation/receipt/route
  await assert.rejects(h.run(['route', 'classify', '--input', inputPath, '--json']), /REFERENCE_WORK_MISMATCH/);
  assert.equal(existsSync(join(cwd, '.omd/route.json')), false);
  const stopped = await h.end();
  const progress = stopped.message.content[0]!.text.split('\n\n')[0] ?? '';
  assert.match(progress, new RegExp(inputPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(progress, /route validate/);
  assert.match(stopped.message.content[0]!.text, /REFERENCE_WORK_MISMATCH/);
  assert.match(stopped.message.content[0]!.text, /hypothesis-validation/);
  assert.doesNotMatch(stopped.message.content[0]!.text, /ROUTE_UNCLASSIFIED/);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]![0].customType, 'omd-route-repair');
  assert.match(h.sent[0]![0].content, /Classification was already attempted/);
  assert.equal(h.calls.some(args => args[0] === 'guard' && args[1] === 'completion'), false);

  // Simulate the model applying the named repairs, not a hidden extension writer or forged receipt.
  repair(input); await h.author(input);
  const validated = JSON.parse((await h.run(['route', 'validate', '--input', inputPath, '--json'])).content[0]!.text);
  assert.equal(validated.ok, true); assert.equal(validated.published, false);
  const classified = JSON.parse((await h.run(['route', 'classify', '--input', inputPath, '--json'])).content[0]!.text);
  assert.ok(classified.gates.includes('dual-reference-research'));
  await h.run(['route', 'check', '--json']);
  const resumed = JSON.parse((await h.run(['stage', 'resume', '--json'])).content[0]!.text);
  assert.equal(resumed.current, 'domain');
  await assert.rejects(h.run(['brief', 'domain', '--check', '--json']));
  await h.run(['stage', 'deliver', '--stage', 'domain', '--contract', 'protocol/domain-analysis.md', '--json']);
  await h.run(['brief', 'domain', '--check', '--json']);
  await h.run(['ref', 'discover-plan', '--json']);
  await assert.rejects(h.run(['guard', 'production', '--json']));
  const blocked = await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } }) as { block: boolean };
  assert.equal(blocked.block, true);
  assert.equal(existsSync(join(cwd, 'src')), false);
  assert.equal(existsSync(join(cwd, '.omd/copy-deck.md')), false);
});

test('bootstrap retries stop on repeated unchanged input and reread current input; input-only recovery does not authorize publication', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-bootstrap-budget-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  let pass = false;
  const h = harness(cwd, async () => ({ stdout: pass ? successReport : failureReport(), stderr: '', code: pass ? 0 : 1, killed: false }));
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.author();
  await assert.rejects(h.run(['route', 'validate', '--input', inputPath, '--locale-context', '.omd/locale-design-context.json', '--json']));
  for (let i = 0; i < 4; i++) {
    await h.end(); await h.emit('input', { source: 'extension' });
  }
  assert.equal(h.sent.length, 3);
  assert.match(h.sent[0]![0].content, /input editing and validation only; do not publish/);
  assert.ok(h.calls.every(args => args.includes('--locale-context')));
  pass = true;
  const current = await h.end();
  assert.match(current.message.content[0]!.text, /Route input is valid but not published/);
  assert.doesNotMatch(current.message.content[0]!.text, /REFERENCE_WORK_MISMATCH/);
  await h.emit('input', { source: 'interactive' });
  assert.equal(await h.end(), undefined);
  pass = false; await h.author();
  await assert.rejects(h.run(['route', 'validate', '--input', inputPath, '--json']));
  await h.end(); assert.equal(h.sent.length, 4);
});

test('bootstrap keeps repairing beyond two passes while the authored input changes', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-bootstrap-progress-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const h = harness(cwd, async () => ({ stdout: failureReport(), stderr: '', code: 1, killed: false }));
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  for (let round = 0; round < 5; round++) {
    const value = fixture(); value.request = `Repair round ${round}`;
    await h.author(value);
    await assert.rejects(h.run(['route', 'validate', '--input', inputPath, '--json']));
    await h.end(); await h.emit('input', { source: 'extension' });
  }
  assert.equal(h.sent.length, 5);
  assert.ok(h.sent.every(([message]) => message.customType === 'omd-route-repair'));
});

test('read-only validation, user aborts, authority errors and existing routes cannot trigger bootstrap continuation', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-bootstrap-authority-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  let authority = false;
  const h = harness(cwd, async (_command, args) => ({ stdout: authority && args[2] === 'classify' ? '' : failureReport(),
    stderr: authority && args[2] === 'classify' ? 'ROUTE_AUTHORITY_REQUIRED' : '', code: 1, killed: false }));
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await assert.rejects(h.run(['route', 'validate', '--input', inputPath, '--json']));
  assert.equal(await h.end(), undefined);
  await h.author(); authority = true;
  await assert.rejects(h.run(['route', 'classify', '--input', inputPath, '--json']));
  const stopped = await h.end();
  assert.match(stopped.message.content[0]!.text, /ROUTE_AUTHORITY_REQUIRED/);
  assert.equal(h.sent.length, 0);
  const controller = new AbortController(); controller.abort();
  assert.equal(await h.emit('message_end', { message: final }, controller.signal), undefined);
  assert.equal(await h.emit('message_end', { message: { ...final, stopReason: 'aborted' } }), undefined);
  assert.equal(await h.emit('message_end', { message: { ...final, stopReason: 'toolUse' } }), undefined);
  await h.emit('input', { source: 'interactive' });
  writeFileSync(join(cwd, '.omd/route.json'), '{}'); // presence boundary; mock CLI still fails closed
  await h.author(); authority = false;
  await assert.rejects(h.run(['route', 'validate', '--input', inputPath, '--json']));
  await h.end(); assert.equal(h.sent.length, 0);
  assert.deepEqual(h.calls.at(-1), ['guard', 'completion', '--json']);
});

test('unknown, mixed-authority and malformed diagnostic reports never grant retry authority', () => {
  assert.equal(routeInputFailure(failureReport()).repairable, true);
  for (const value of ['invalid JSON', 'ROUTE_AUTHORITY_REQUIRED', failureReport(['REFERENCE_WORK_MISMATCH', 'LOCALE_DESIGN_CLARIFICATION_REQUIRED']), failureReport(['NEW_UNKNOWN_FAILURE']), '{"schema":"adaptive-route-validation-v1","ok":false,"published":false,"diagnostics":[null]}']) {
    assert.equal(routeInputFailure(value).repairable, false);
    assert.equal(classificationAllowsInputRepair(value), false);
  }
});

test('a repaired valid input can resume an already-attempted classification without replaying stale errors', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-bootstrap-resume-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const h = harness(cwd, async (_command, args) => args[2] === 'classify'
    ? { stdout: '', stderr: 'REFERENCE_WORK_MISMATCH: missing method', code: 1, killed: false }
    : { stdout: successReport, stderr: '', code: 0, killed: false });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.author();
  await assert.rejects(h.run(['route', 'classify', '--input', inputPath, '--json']));
  const current = await h.end();
  assert.match(current.message.content[0]!.text, /Route input is valid but not published/);
  assert.doesNotMatch(current.message.content[0]!.text, /REFERENCE_WORK_MISMATCH/);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0]![0].content, /retry that authorized classification with the same input\/context/);
  assert.equal(h.calls.filter(args => args[1] === 'classify').length, 1); // the extension never publishes by itself
});

test('real design-only bootstrap recovery preserves the non-implementation delivery mode', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-bootstrap-design-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const h = harness(cwd);
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign Design-only, no application code' });
  const input = structuredClone(inputSkeleton('design-route-input').skeleton) as ReturnType<typeof fixture>;
  input.strategyDecision.methods = input.strategyDecision.methods.filter((m: string) => m !== 'hypothesis-validation');
  await h.author(input);
  await assert.rejects(h.run(['route', 'classify', '--input', inputPath, '--json']));
  await h.end(); assert.equal(h.sent.length, 1);
  input.strategyDecision.methods.push('hypothesis-validation'); await h.author(input);
  await h.run(['route', 'validate', '--input', inputPath, '--json']);
  const route = JSON.parse((await h.run(['route', 'classify', '--input', inputPath, '--json'])).content[0]!.text);
  assert.equal(route.deliveryMode, 'design-only');
  assert.deepEqual(route.allowedPaths, ['.omd/**']);
  assert.equal(route.strategy.roles.includes('omd-hand'), false);
  const blocked = await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } }) as { block: boolean };
  assert.equal(blocked.block, true);
  assert.equal(existsSync(join(cwd, 'src')), false);
});

test('bootstrap argv cannot lose authority options, locale bindings or duplicate input semantics', () => {
  const args = ['route', 'classify', '--input', 'a path/input.json', '--locale-context', '.omd/locale-design-context.json', '--json'];
  assert.deepEqual(routeValidationArgs(args)?.validationArgs, ['route', 'validate', '--input', 'a path/input.json', '--json', '--locale-context', '.omd/locale-design-context.json']);
  for (const extra of [['--input', 'different.json'], ['--activation', 'host.json'], ['--unknown'], ['--locale-context', 'other.json'], ['extra']]) {
    assert.equal(routeValidationArgs([...args, ...extra]), undefined);
  }
});
