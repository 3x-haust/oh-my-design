import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyJudgment, type JudgmentPolicy, type JudgmentInput, type JudgmentVerificationContext } from '../core/judgment/index.ts';
import { parseOmdWorkflowPrompt } from '../extensions/omd-request-prompt.ts';
import { WorkflowResume } from '../extensions/omd-workflow-resume.ts';
import { PiRequestBindings } from '../extensions/omd-request-binding.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const prompt = '앱을 살펴보고 구현해 줘';
const source = { kind: 'user-turn' as const, sessionId: 's', turnId: 't', sha256: hash(prompt) };
const context = { requestSha256: hash('request'), sourceContractSha256: null, questionDigest: null, documentSha256: null };
const policy = (purpose: string, decisions: string[]): JudgmentPolicy => ({ purpose, decisions, authorRoles: ['coordinator'], sourceKinds: ['user-turn'], fields: ['text'], requiredSourceKinds: ['user-turn'], parsePayload: value => value, mode: 'advisory' });
const input = (purpose: string, decision: string, text: string): JudgmentInput => ({ schema: 'ai-judgment-v1', purpose, subjectId: 't', context, decision, reason: 'Agent decision', quotes: [{ source: { ...source, sha256: hash(text) }, field: 'text', itemId: null, text }], evidence: [], payload: null });
const resolver = (text: string): JudgmentVerificationContext => ({ ...context, resolve: async (_ref, field, itemId) => ({ ...context, field, itemId, text, sha256: hash(text) }) });
test('workflow intent uses verified current user text rather than keyword matching', async () => {
  assert.equal(parseOmdWorkflowPrompt(`/skill:omd-ultradesign ${prompt}`), null);
  const verified = await verifyJudgment(input('workflow-intent', 'implement', prompt), policy('workflow-intent', ['implement', 'inspect']), resolver(prompt));
  assert.deepEqual(parseOmdWorkflowPrompt(`/skill:omd-ultradesign ${prompt}`, verified), { kind: 'full-build', request: prompt });
  const realTurn = `/skill:omd-ultradesign ${prompt}`;
  const fromWholeTurn = await verifyJudgment(input('workflow-intent', 'implement', realTurn), policy('workflow-intent', ['implement']), resolver(realTurn));
  assert.deepEqual(parseOmdWorkflowPrompt(realTurn, fromWholeTurn), { kind: 'full-build', request: prompt });
  assert.equal(parseOmdWorkflowPrompt(`/skill:omd-ultradesign 다른 요청`, verified), null);
  await assert.rejects(verifyJudgment(input('workflow-intent', 'implement', 'fabricated'), policy('workflow-intent', ['implement']), resolver(prompt)));
});
test('a captured explicit skill request can enter route authoring before an intent judgment exists', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-intent-advisory-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const bindings = new PiRequestBindings();
  const turn = `/skill:omd-ultradesign ${prompt}`;
  bindings.receive(cwd, { source: 'interactive', text: turn });
  bindings.activate(cwd, turn);
  assert.equal(bindings.classificationGranted(cwd), true);
  assert.ok(bindings.pin(cwd, ['route', 'validate', '--input', '.omd/.cache/route-input.json', '--json']));
});

test('continuation requires verified text and current route', async () => {
  const resume = new WorkflowResume(); const digest = hash('route');
  resume.remember('/project', digest);
  assert.equal(resume.accepts({ cwd: '/project', routeSha256: digest, prompt: '계속해' }), false);
  const judgment = await verifyJudgment(input('workflow-continuation', 'resume', prompt), policy('workflow-continuation', ['resume', 'cancel']), resolver(prompt));
  assert.equal(resume.accepts({ cwd: '/project', routeSha256: digest, prompt, judgment }), true);
  assert.equal(resume.accepts({ cwd: '/project', routeSha256: hash('new route'), prompt, judgment: { ...judgment } }), false);
});
