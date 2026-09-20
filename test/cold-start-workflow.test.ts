import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import omdExtension, { type PortablePiApi, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { isPreproductionReadCommand } from '../extensions/omd-guard.ts';
import { copyDeckSha256 } from '../core/copy/index.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('OMD_') && k !== 'NODE_TEST_CONTEXT'));
const run = (cwd: string, args: readonly string[]) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 30000 });
const fixtureRoot = fileURLToPath(new URL('fixtures/', import.meta.url));
const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '작업을 완료했습니다.' }] };
function project(t: { after(fn: () => void): void }) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-cold-start-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}
function harness(cwd: string) {
  const hooks = new Map<string, PortablePiHook>();
  const sent: Array<Parameters<NonNullable<PortablePiApi['sendMessage']>>> = [];
  const calls: string[][] = [];
  let tool!: PortablePiTool;
  omdExtension({
    on: (name, hook) => { hooks.set(name, hook); }, registerCommand() {}, registerTool(t) { tool = t; },
    sendMessage: (...args) => { sent.push(args); },
    async exec(_command, args, options) {
      calls.push([...args.slice(1)]);
      const result = run(options.cwd, args.slice(1));
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
    },
  });
  const emit = (name: string, event: Parameters<PortablePiHook>[0], signal?: AbortSignal) => hooks.get(name)!(event, { cwd, ...(signal ? { signal } : {}) });
  const command = async (args: string[]) => {
    await emit('tool_call', { toolName: 'omd_cli', input: { args } });
    return (await tool.execute('cold-start', { args }, undefined, undefined, { cwd })).content[0]!.text;
  };
  const author = async (path: string, value: unknown) => {
    assert.equal(await emit('tool_call', { toolName: 'write', input: { path } }), undefined);
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const enter = (stage: string) => command(['brief', stage, '--check', '--json']);
  const deliver = async (stage: string) => {
    const brief = JSON.parse(await command(['brief', stage, '--json']));
    for (const c of brief.contracts) {
      await command(['pack', c.path]);
      await command(['stage', 'deliver', '--stage', stage, '--contract', c.path]);
    }
  };
  const start = async (starter = 'product-route-input') => {
    await emit('before_agent_start', { prompt: '/skill:omd-ultradesign Build the requested local product.' });
    // Fixture request authorizes only local demo work; not a claim about a live client or service.
    const route = structuredClone(inputSkeleton(starter).skeleton) as Record<string, unknown>;
    route.request = domain().request;
    await author('.omd/.cache/route-input.json', route);
    await command(['route', 'validate', '--input', '.omd/.cache/route-input.json', '--json']);
    await command(['route', 'classify', '--input', '.omd/.cache/route-input.json', '--json']);
    await deliver('domain'); await enter('domain');
  };
  return { emit, sent, calls, command, author, enter, deliver, start };
}
const domain = () => {
  const evidence = [{ status: 'user-provided', reference: 'test request' }];
  const statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'test request', excerpt: text }] });
  return { schema: 'domain-brief-v1', request: 'Build a local confirmation demo; no real submissions.', domain: 'Confirmation', summary: 'Inspect a confirmation in a labelled demo.',
    surfaces: [{ name: 'confirmation', purpose: 'Inspect confirmation', evidence }], coreObjects: [{ name: 'confirmation', evidence }],
    audience: { description: 'Demo evaluator', evidence }, referenceQueries: { component: ['confirmation detail'], craft: ['editorial type hierarchy'], mood: ['quiet reading'] },
    planning: { businessGoal: statement('Build a local confirmation demo'), successSignal: statement('Inspect confirmation'), nonGoals: [statement('No real submissions')] } };
};
const deck = `# Copy deck
## Sources and fact ledger
| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | Test request | This is a local demo. |
## Audience language
Test request: inspect the confirmation in the local demo.
## Voice contract
- Audience: Demo evaluator
- Language: en
- Register: direct
- Breath: One message per sentence
## Truth contract
- Result boundary: navigation
- Storage boundary: none
## Surface copy
### Confirmation
- Main message: Inspect confirmation
- Supporting fact: Local demo.
- Next action: View confirmation
- Claim refs: F-001
## Navigation and actions
View confirmation opens the existing confirmation.
## States and recovery
- Interaction scope: navigation-only
- Primary copy: View confirmation
- Recovery copy: N/A — Navigation does not change data.
- Primary probe: .omd/probes/confirmation.json
- Recovery probe: N/A — Navigation does not change data.
## Humanize audit
Read aloud; direct language and one next action.
`;

test('cold start traverses real CLI framing, independent research/copy entry and type dependency, without allowing premature source', async t => {
  const cwd = project(t), h = harness(cwd);
  // Help is actually read-only, including before any route exists.
  const help = run(cwd, ['frame', 'set', '--help']);
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /--task-matrix/);
  assert.deepEqual(readdirSync(cwd), []);
  await h.start();
  await assert.rejects(h.enter('candidate-generation'), /upstream composition/);
  await h.deliver('frame');
  await assert.rejects(h.enter('frame'), /upstream artifact missing.*domain-brief/);
  await h.author('.omd/domain-brief.json', {});
  await assert.rejects(h.enter('frame'), /upstream domain/);
  await h.author('.omd/domain-brief.json', domain());
  assert.equal(JSON.parse(await h.command(['domain', 'check', '--json'])).unconfirmedPlanning.length, 0);
  await h.enter('frame');
  // A stop before ANY source attempt must point to Framer, not a wall of terminal errors.
  const stopped = await h.emit('message_end', { message: final }) as { message: typeof final };
  assert.match(stopped.message.content[0]!.text, /frame/);
  assert.doesNotMatch(stopped.message.content[0]!.text, /작업을 완료했습니다|guard completion/);
  assert.equal(h.sent[0]![0].customType, 'omd-stage-repair');
  assert.ok(!h.calls.some(c => c[0] === 'guard' && c[1] === 'completion'));
  const frame = JSON.parse(await h.command(['schema', 'frame', '--json'])).skeleton;
  frame.problem = 'Inspect a confirmation'; frame.reframe = 'A readable confirmation with one next action';
  frame.why = 'Test request explicitly asks for a local confirmation demo.';
  frame.uxTask = 'Inspect confirmation'; frame.uxFrequentAction = 'View confirmation'; frame.uxCostliestError = 'Mistaking a demo for a real submission';
  frame.taskCoverageMatrix = 'T1 | goal: Inspect confirmation | start: entry | actions: View confirmation | success: confirmation visible | recovery: return to entry | viewports: desktop,mobile | requirements: none';
  frame.reality.facts[0].statement = 'The test request authorizes a labelled local demo.';
  await h.author('.omd/.cache/frame-input.json', frame);
  await assert.rejects(h.command(['frame', 'set', '--task-coverage', '.omd/.cache/frame-input.json']), /FRAME_OPTIONS_INVALID.*task-coverage/);
  await assert.rejects(h.command(['frame', 'set', '--task', 'a', '--task', 'b']), /FRAME_OPTIONS_INVALID.*task/);
  assert.equal(existsSync(join(cwd, '.omd/frame.md')), false);
  await h.command(['frame', 'set', '--input', '.omd/.cache/frame-input.json']);
  assert.equal(JSON.parse(await h.command(['frame', 'check', '--json'])).ok, true);
  await h.author('.omd/.cache/reality-update.json', frame.reality);
  await h.command(['frame', 'set', '--reality', '.omd/.cache/reality-update.json', '--why', 'The test request still authorizes the same demo facts.']);
  assert.equal(JSON.parse(await h.command(['frame', 'check', '--json'])).ok, true, 'partial reality update must not erase UX/matrix');
  const published = readFileSync(join(cwd, '.omd/frame.md'), 'utf8');
  delete frame.taskCoverageMatrix;
  await h.author('.omd/.cache/frame-input.json', frame);
  await assert.rejects(h.command(['frame', 'set', '--input', '.omd/.cache/frame-input.json']), /omd schema frame/);
  assert.equal(readFileSync(join(cwd, '.omd/frame.md'), 'utf8'), published);
  for (const stage of ['scout', 'copy', 'type-proof']) await h.deliver(stage);
  await h.enter('scout');
  await h.enter('copy'); // Writer does NOT wait for Scout's output merely because of array order.
  await assert.rejects(h.enter('type-proof'), /upstream artifact missing.*copy-deck/);
  const plan = JSON.parse(await h.command(['ref', 'discover-plan', '--json']));
  assert.equal(plan.lanes.length, 2);
  // Native captured fixtures exercise the research write path, not source writes or invented
  // public-service evidence. Full research/application validation must still refuse these alone.
  await h.command(['ref', 'add', join(fixtureRoot, 'slop.html'), '--as', 'fixture-domain', '--lane', 'domain', '--no-energy']);
  await assert.rejects(h.command(['ref', 'add', join(fixtureRoot, 'slop.html'), '--as', 'renamed-design', '--lane', 'design', '--no-energy']), /REFERENCE_LANE_SOURCE_OVERLAP/);
  await assert.rejects(h.command(['ref', 'add', join(fixtureRoot, 'considered.html'), '--as', 'fixture-design', '--lane', 'design', '--no-energy']), /DESIGN_DISCOVERY_REQUIRED/);
  await h.command(['ref', 'add', join(fixtureRoot, 'considered.html'), '--as', 'fixture-design', '--lane', 'design', '--from-user', '--no-energy']);
  for (const lane of ['domain', 'design']) assert.ok(readdirSync(join(cwd, '.omd/refs', lane)).some(path => path.endsWith('.png')));
  await h.author('.omd/copy-deck.md', '# Not a copy deck');
  await assert.rejects(h.enter('type-proof'), /upstream copy/);
  await h.author('.omd/copy-deck.md', deck);
  await h.command(['copy', '--check']);
  await assert.rejects(h.enter('type-proof'), /upstream copy.*current copy review/);
  await h.author('.omd/.cache/copy-eye.md', `Mode: copy-editor\nReview time: 2026-09-21T00:00:00Z\nReviewed copy-deck SHA-256: ${copyDeckSha256(Buffer.from(deck))}\nVerdict: CLEAN\nFindings: Same-session test fixture; no independent review attestation.\n`);
  await h.enter('type-proof');
  await h.author('.omd/copy-deck.md', deck + '\nChanged after review.\n');
  await assert.rejects(h.enter('type-proof'), /upstream copy.*current copy-deck bytes/);
  await h.author('.omd/copy-deck.md', deck);
  const requirements = JSON.parse(await h.command(['schema', 'functional-requirements', '--json']));
  assert.equal(requirements.path, '.omd/.cache/functional-requirements.json');
  await h.author(requirements.path, requirements.skeleton);
  await h.command(['complete', 'set', '--input', requirements.path, '--json']);
  assert.ok(existsSync(join(cwd, '.omd/functional-requirements.json')));
  const refused = await h.emit('tool_call', { toolName: 'write', input: { path: 'package.json' } }) as { block: boolean };
  assert.equal(refused.block, true);
  assert.equal(existsSync(join(cwd, 'package.json')), false);
  await assert.rejects(h.command(['guard', 'completion', '--json']));
});

test('planning gaps are named early, cannot be inferred away, and fresh-stage retry is bounded/reset by real input', async t => {
  const cwd = project(t), h = harness(cwd); await h.start();
  const brief = domain(); delete (brief.planning.successSignal as { userEvidence?: unknown }).userEvidence;
  await h.author('.omd/domain-brief.json', brief);
  const checked = JSON.parse(await h.command(['domain', 'check', '--json']));
  assert.deepEqual(checked.unconfirmedPlanning, ['successSignal']);
  const work = JSON.parse(await h.command(['stage', 'next', '--json']));
  assert.equal(work.action, 'resolve-planning-evidence');
  assert.deepEqual(work.planning, [{ field: 'successSignal', text: 'Inspect confirmation' }]);
  for (let i = 0; i < 3; i++) await h.emit('message_end', { message: final });
  assert.equal(h.sent.length, 2);
  const held = await h.emit('message_end', { message: final }) as { message: typeof final };
  assert.match(held.message.content[0]!.text, /successSignal: Inspect confirmation/);
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, '.omd/domain-brief.json'), 'utf8')), brief);
  await h.emit('input', { source: 'interactive' });
  await h.emit('before_agent_start', { prompt: 'What happened? Only inspect.' });
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  assert.equal(h.sent.length, 2);
});

test('only closed read-only inventory syntax is exempt from the source gate', () => {
  for (const s of ["pwd && rg --files --hidden -g '!node_modules' -g '!.git' | head -80", 'rg --files --hidden | head -200']) assert.equal(isPreproductionReadCommand(s), true, s);
  for (const s of ["rg --files --pre evil | head -80", "rg --files -g '$(touch x)'", "rg --files | head -80 > x", "pwd && rg --files\nnode x", "rg --files | head -80; touch x"]) assert.equal(isPreproductionReadCommand(s), false, s);
});

test('a domain brief for a different request stays with its owner and earns no stage progress', async t => {
  const cwd = project(t), h = harness(cwd); await h.start();
  const brief = domain(); brief.request = 'A different or shortened request.';
  await h.author('.omd/domain-brief.json', brief);
  const blocked = JSON.parse(await h.command(['stage', 'next', '--json']));
  assert.equal(blocked.stage, 'domain');
  assert.equal(blocked.progress.validatedStages.includes('domain'), false);
  await h.author('.omd/domain-brief.json', domain());
  const repaired = JSON.parse(await h.command(['stage', 'next', '--json']));
  assert.equal(repaired.stage, 'frame');
  assert.ok(repaired.progress.validatedStages.includes('domain'));
});

test('fresh-stage correction stops for a concrete user question and abort; help is not a mutation', async t => {
  const cwd = project(t), h = harness(cwd);
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.command(['frame', 'set', '--help']);
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  await h.start();
  const brief = domain(); delete (brief.planning.nonGoals[0] as { userEvidence?: unknown }).userEvidence;
  await h.author('.omd/domain-brief.json', brief);
  const asks = { ...final, content: [{ type: 'text', text: '실제 제출을 제외한 데모만 구현하면 될까요?' }] };
  const held = await h.emit('message_end', { message: asks }) as { message: typeof final };
  assert.match(held.message.content[0]!.text, /nonGoals\[0\]: No real submissions/);
  assert.equal(h.sent.length, 0);
  const abort = new AbortController(); abort.abort();
  assert.equal(await h.emit('message_end', { message: final }, abort.signal), undefined);
  assert.equal(h.sent.length, 0);
});

test('atomic frame input also works over the publisher stdin transport without authoring privileges', t => {
  const cwd = project(t);
  const frame = structuredClone(inputSkeleton('frame').skeleton);
  const result = spawnSync(process.execPath, [cli, 'frame', 'set', '--input', '-'], { cwd, env, input: JSON.stringify(frame), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(cwd, ['frame', 'check', '--json']).status, 0);
  assert.equal(existsSync(join(cwd, '.omd/.cache/frame-input.json')), false);
  assert.ok(existsSync(join(cwd, '.omd/frame.md')));
});

test('design-only fresh work keeps open planning questions without forcing production confirmation or application writes', async t => {
  const cwd = project(t), h = harness(cwd); await h.start('design-route-input');
  const brief = domain(); delete (brief.planning.successSignal as { userEvidence?: unknown }).userEvidence;
  await h.author('.omd/domain-brief.json', brief);
  const work = JSON.parse(await h.command(['stage', 'next', '--json']));
  assert.equal(work.deliveryMode, 'design-only');
  assert.equal(work.stage, 'frame');
  assert.equal(work.action, 'author-output');
  assert.deepEqual(work.planning, [{ field: 'successSignal', text: 'Inspect confirmation' }]);
  await h.emit('message_end', { message: final });
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0]![0].content, /"deliveryMode":"design-only"/);
  const blocked = await h.emit('tool_call', { toolName: 'write', input: { path: 'package.json' } }) as { block: boolean };
  assert.equal(blocked.block, true);
  assert.equal(existsSync(join(cwd, 'package.json')), false);
});
