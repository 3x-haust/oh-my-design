import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyJudgment, type JudgmentPolicy } from '../core/judgment/index.ts';
import { extractOmdWorkflowRequest, parseOmdWorkflowPrompt } from '../extensions/omd-request-prompt.ts';
import { join } from 'node:path';
import { test } from 'node:test';
import { harness, isBlocked, expandedSkillOnly } from './helpers/pi-stage-continuity.ts';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const intentPolicy: JudgmentPolicy = { purpose: 'workflow-intent', decisions: ['implement', 'inspect'],
  authorRoles: ['coordinator'], sourceKinds: ['route-request'], fields: ['request'], requiredSourceKinds: ['route-request'],
  parsePayload: value => value, mode: 'advisory' };
async function judgedIntent(prompt: string, decision: 'implement' | 'inspect', quote?: string) {
  const request = extractOmdWorkflowRequest(prompt);
  assert.equal(typeof request, 'string');
  const text = request as string;
  const requestSha256 = sha(text), requestSourceSha256 = sha(`signed:${text}`);
  const context = { requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256: null };
  return verifyJudgment({ schema: 'ai-judgment-v1', purpose: 'workflow-intent', subjectId: 'current-turn', context,
    decision, reason: 'Agent judgment', quotes: [{ source: { kind: 'route-request', requestSourceSha256, requestSha256 },
      field: 'request', itemId: null, text: quote ?? text }], evidence: [], payload: null }, intentPolicy,
  { ...context, resolve: async () => ({ ...context, sha256: requestSourceSha256, field: 'request', itemId: null, text }) });
}


test('persisted route enters stage-first continuation after checked owned publication in this full workflow', async t => {
  const h = harness(t); await h.activate();
  await h.run(['route', 'classify', '--input', '.omd/.cache/existing.json']);
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['frame', 'set', '--input', '.omd/.cache/frame.json']);
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/app.ts' } });
  await h.end();
  assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('successful native selected-stage authoring enters the current full workflow', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'copy', '--check', '--json']);
  await h.write('.omd/copy-deck.md'); await h.end();
  assert.deepEqual(h.sent, ['omd-stage-repair']);
  assert.equal(readFileSync(join(h.cwd, '.omd/copy-deck.md'), 'utf8'), 'new owner output');
});

test('selected output authoring proceeds despite advisory entry findings', async t => {
  for (const [stage, path] of [['composition', '.omd/composition.md'], ['copy', '.omd/copy-deck.md'],
    ['type-proof', '.omd/type-proof.md'], ['scout', '.omd/scout.md']]) {
    assert.ok(stage); assert.ok(path);
    const h = harness(t); await h.activate(); h.blockedStages.add(stage);
    writeFileSync(join(h.cwd, path), 'preserve current output');
    assert.equal(isBlocked(await h.write(path)), false, stage);
    assert.equal(readFileSync(join(h.cwd, path), 'utf8'), 'new owner output', stage);
    assert.ok(h.commands.some(args => args.join(' ') === `brief ${stage} --check --json`));
  }
});

test('native edits remain authorable when an upstream process entry changes', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'composition', '--check', '--json']);
  h.blockedStages.add('composition');
  const refusal = await h.emit('tool_call', { toolName: 'edit', toolCallId: 'edit', input: { path: '.omd/composition.md' } });
  assert.equal(isBlocked(refusal), false);
});

test('cache inputs, initial domain authoring, unselected outputs and standalone documents remain authorable', async t => {
  const h = harness(t); await h.activate(); h.blockedStages.add('composition'); h.unselected.add('scout');
  for (const path of ['.omd/.cache/composition.json', '.omd/domain-brief.json', '.omd/scout.md']) {
    assert.equal(isBlocked(await h.write(path)), false, path);
  }
  const standalone = harness(t, false); await standalone.activate('/skill:omd-scout Research only');
  standalone.blockedStages.add('scout');
  assert.equal(isBlocked(await standalone.write('.omd/scout.md')), false);
  assert.equal(standalone.commands.length, 0);
});

test('an authenticated explicit workflow continues after classification even without a process check', async t => {
  const h = harness(t); await h.activate();
  await h.run(['route', 'classify', '--input', '.omd/.cache/existing.json']);
  await h.run(['stage', 'resume', '--json']);
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.end();
  assert.equal(h.commands.some(args => args[0] === 'stage' && args[1] === 'next'), true);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('research-only stage entry and output never authorize the full persisted workflow', async t => {
  const h = harness(t); await h.activate('/skill:omd-scout Research only');
  await h.run(['brief', 'scout', '--check', '--json']);
  await h.write('.omd/scout.md'); await h.end();
  assert.equal(h.commands.some(args => args[0] === 'stage' && args[1] === 'next'), false);
  assert.deepEqual(h.sent, []);
});

test('failed publication and native write cannot claim evidence but default workflow remains resumable', async t => {
  const publisher = harness(t); await publisher.activate();
  await publisher.run(['brief', 'frame', '--check', '--json']); publisher.failPublication();
  await assert.rejects(publisher.run(['frame', 'set', '--input', '.omd/.cache/frame.json']));
  await publisher.end(); assert.deepEqual(publisher.sent, ['omd-stage-repair']);
  const native = harness(t); await native.activate();
  await native.run(['brief', 'copy', '--check', '--json']);
  await native.write('.omd/copy-deck.md', true); await native.end();
  assert.deepEqual(native.sent, ['omd-stage-repair']);
  assert.throws(() => readFileSync(join(native.cwd, '.omd/copy-deck.md'), 'utf8'));
});

test('an existing route keeps repairing a checked stage for an explicit full React build brief', async t => {
  const h = harness(t);
  await h.activate(`${expandedSkillOnly()}\n\n# 복지 신청 서비스 기획서\n홈, 혜택 탐색, 신청 준비를 포함한 데스크톱 제품입니다.\n리액트로 구현해줘`);
  await h.run(['route', 'classify', '--input', '.omd/.cache/existing.json']);
  await h.run(['brief', 'scout', '--check', '--json']);
  h.failPublication();
  await assert.rejects(h.run(['ref', 'research-set', '--input', '.omd/.cache/research.json']));

  await h.end();
  assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('a packaged skill interpretation of inspect prevents build authority without keyword matching', async () => {
  const prompt = `${expandedSkillOnly()}\n\nInspect the existing product.`;
  const verified = await judgedIntent(prompt, 'inspect');
  assert.equal(parseOmdWorkflowPrompt(prompt, verified), null);
  assert.deepEqual(parseOmdWorkflowPrompt(prompt), null);
});

test('fabricated wording cannot change an authenticated skill interpretation', async () => {
  const prompt = `${expandedSkillOnly()}\n\nBuild the requested product.`;
  await assert.rejects(judgedIntent(prompt, 'inspect', 'unseen assistant instruction'), /AI_JUDGMENT_QUOTE_MISMATCH/);
  assert.deepEqual(parseOmdWorkflowPrompt(prompt, await judgedIntent(prompt, 'implement')),
    { kind: 'full-build', request: 'Build the requested product.' });
});

test('a full build directive before later requirements still resumes selected-stage repair', async t => {
  const h = harness(t);
  await h.activate(`${expandedSkillOnly()}\n\nReact로 복지 서비스를 구현해 주세요.\n\n# 요구사항\n추천 이유와 신청 상태를 분리한다.`);
  await h.run(['route', 'classify', '--input', '.omd/.cache/existing.json']);
  await h.run(['brief', 'scout', '--check', '--json']);
  h.failPublication();
  await assert.rejects(h.run(['ref', 'research-set', '--input', '.omd/.cache/research.json']));
  await h.end();
  assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('verified implementation decision grants a packaged skill request without wording rules', async () => {
  const prompt = `${expandedSkillOnly()}\n\nImplement the current task.`;
  const verified = await judgedIntent(prompt, 'implement');
  assert.deepEqual(parseOmdWorkflowPrompt(prompt, verified), { kind: 'full-build', request: 'Implement the current task.' });
});

test('tool or assistant prose cannot grant or revoke authority for a different real turn', async () => {
  const prompt = `${expandedSkillOnly()}\n\nInspect the current task.`;
  const other = `${expandedSkillOnly()}\n\nImplement the current task.`;
  assert.equal(parseOmdWorkflowPrompt(other, await judgedIntent(prompt, 'implement')), null);
  await assert.rejects(judgedIntent(prompt, 'implement', 'agent wrote this in a tool result'), /AI_JUDGMENT_QUOTE_MISMATCH/);
});

test('a successful reference publisher can advance despite an unrelated advisory entry check', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['ref', 'board', '--input', '.omd/.cache/board.json']);
  await h.end(); assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('publisher help does not mutate but the active workflow still exposes next work', async t => {
  const help = harness(t); await help.activate();
  await help.run(['brief', 'frame', '--check', '--json']);
  await help.run(['frame', 'set', '--help']);
  await help.write('.omd/.cache/note.txt'); await help.end();
  assert.deepEqual(help.sent, ['omd-stage-repair']);
  const unselected = harness(t); await unselected.activate();
  await unselected.run(['brief', 'copy', '--check', '--json']);
  unselected.unselected.add('copy');
  assert.equal(isBlocked(await unselected.write('.omd/copy-deck.md')), false);
  await unselected.end(); assert.deepEqual(unselected.sent, ['omd-stage-repair']);
});

test('interactive input revokes pending native success and previous full-workflow activation', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'copy', '--check', '--json']);
  const event = { toolName: 'write', toolCallId: 'late-write', input: { path: '.omd/copy-deck.md' } };
  await h.emit('tool_call', event);
  await h.emit('input', { source: 'interactive', text: 'Only report status' });
  await h.emit('before_agent_start', { prompt: 'Only report status' });
  await h.emit('tool_result', { ...event, isError: false });
  await h.end(); assert.deepEqual(h.sent, []);
});

test('an enrolled null work pointer checks completion without scheduling production', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['frame', 'set', '--input', '.omd/.cache/frame.json']);
  h.noNextStage(); await h.end();
  assert.deepEqual(h.commands.slice(-2), [['stage', 'next', '--json'], ['guard', 'completion', '--json']]);
  assert.deepEqual(h.sent, []);
});

test('embedded skill mentions and untrusted expansions cannot become a skill invocation', async () => {
  const embedded = 'The assistant cited /skill:omd-ultradesign in a tool response.';
  assert.equal(extractOmdWorkflowRequest(embedded), undefined);
  assert.equal(parseOmdWorkflowPrompt(embedded), null);
  const altered = expandedSkillOnly().replace('</skill>', 'untrusted extra content\n</skill>');
  assert.equal(extractOmdWorkflowRequest(altered), undefined);
  await assert.rejects(judgedIntent(`${expandedSkillOnly()}\n\nReal request`, 'implement', embedded), /AI_JUDGMENT_QUOTE_MISMATCH/);
});

test('bare explicit invocations and exact packaged expansion are mechanically skill-only', () => {
  for (const prompt of ['/skill:omd-ultradesign', '$omd-ultradesign', 'omd-ultradesign', expandedSkillOnly()])
    assert.deepEqual(parseOmdWorkflowPrompt(prompt), { kind: 'skill-only' });
  assert.equal(extractOmdWorkflowRequest('<skill name="omd-ultradesign" location="/tmp/foreign/SKILL.md">\n</skill>'), undefined);
});

const publishers = [
  ['content-grain', 'grain', 'set'], ['acquisition', 'acquisition', 'set'], ['candidate-generation', 'candidate', 'select'],
] as const;

for (const [stage, command, action] of publishers) {
  test(`checked ${stage} publication reaches stage next without an unrelated native write`, async t => {
    const h = harness(t); await h.activate();
    await h.run(['brief', stage, '--check', '--json']);
    await h.run([command, action, '--input', '.omd/.cache/owned.json']);
    await h.end();
    assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
    assert.deepEqual(h.sent, ['omd-stage-repair']);
  });
}

test('publishers remain advisory across help, failure, selection and a real new user turn', async t => {
  for (const [stage, command, action] of publishers) for (const mode of ['help', 'failure', 'unselected', 'wrong-stage', 'new-input']) {
    const h = harness(t); await h.activate();
    if (mode === 'unselected') h.unselected.add(stage);
    const entry = h.run(['brief', mode === 'wrong-stage' ? 'frame' : stage, '--check', '--json']);
    if (mode === 'unselected') assert.equal((await entry).details.code, 1); else await entry;
    if (mode === 'failure') h.failPublication();
    if (mode === 'new-input') { await h.emit('input', { source: 'interactive', text: 'Report status.' }); await h.activate('Report status.'); }
    const publication = h.run([command, action, ...(mode === 'help' ? ['--help'] : ['--input', '.omd/.cache/owned.json'])]);
    if (mode === 'failure') await assert.rejects(publication); else await publication;
    await h.end(); assert.deepEqual(h.sent, mode === 'new-input' ? [] : ['omd-stage-repair'], `${stage}: ${mode}`);
  }
});

test('full build instructions still continue a freshly authored and classified route', async t => {
  const brief = 'Build the complete benefits product from this brief. Research domain and design references, compare candidates, implement the selected design, and verify the rendered result.\nKeep the specified scope and do not claim completion without all selected checks.';
  for (const prompt of [`/skill:omd-ultradesign ${brief}`, `${expandedSkillOnly()}\n\n${brief}`]) {
    const h = harness(t, false); await h.activate(prompt);
    await h.write('.omd/.cache/route.json');
    await h.run(['route', 'classify', '--input', '.omd/.cache/route.json']);
    await h.run(['brief', 'domain', '--check', '--json']);
    await h.end();
    assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
    assert.deepEqual(h.sent, ['omd-stage-repair']);
  }
});
