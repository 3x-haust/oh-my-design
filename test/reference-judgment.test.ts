import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publishJudgment, type JudgmentInput, type JudgmentReadContext } from '../core/judgment/index.ts';
import { referenceDecision, referenceJudgmentPolicy, type ReferenceJudgmentBinding } from '../core/ref/judgment-policy.ts';
import { assessMarketSource } from '../core/ref/market-reference-coverage.ts';
import { judgedSearchTargets, judgedObservedLinkTargets } from '../core/ref/search-result.ts';
import { assessPageAccess } from '../core/ref/judgment-policy.ts';
import { assessDiscoveryQuery } from '../core/ref/reference-query.ts';
import { assessSourceLanguage } from '../core/ref/market-reference.ts';
import { assessDiscoveryTarget } from '../core/ref/discovery-work.ts';
import { assessMoodClaim } from '../core/ref/mood.ts';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const requestSha256 = hash('request');
const sourceSha256 = hash('signed observation');
const documentSha256 = hash('visible document');
const observed = 'Õnnestus! 주민 서비스는 신청 전에 단계별 자격 확인을 제공합니다.';

async function binding(purpose: Parameters<typeof referenceJudgmentPolicy>[0], decision: string, subjectId: string,
  quote = '주민 서비스는 신청 전에', currentDocumentSha256 = documentSha256): Promise<ReferenceJudgmentBinding> {
  const memory = new Map<string, string>();
  const context = { requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256,
    resolve: async (_ref: unknown, field: string, itemId: string | null) => ({ sha256: sourceSha256, field, itemId, text: observed,
      requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256 }) };
  const policy = referenceJudgmentPolicy(purpose, ['observedText']);
  const judgment: JudgmentInput = { schema: 'ai-judgment-v1', purpose, subjectId,
    context: { requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256 },
    decision, reason: 'A cited interpretation of this signed observation',
    quotes: [{ source: { kind: 'receipt', path: '.omd/discovery/domain/observations/current.json', sha256: sourceSha256, schema: 'domain-observation-v1' },
      field: 'observedText', itemId: null, text: quote }], evidence: [], payload: {} };
  const receipt = await publishJudgment(judgment, policy, { ...context,
    author: { role: 'scout', invocationSha256: hash('invocation') }, now: () => '2026-09-28T00:00:00.000Z',
    sign: digest => `signed:${digest}`, write: async (path, bytes) => { memory.set(path, bytes); } });
  const reader: JudgmentReadContext = { ...context, documentSha256: currentDocumentSha256,
    read: async path => Buffer.from(memory.get(path)!), verifySignature: (digest, signature) => signature === `signed:${digest}` };
  return { receipt, context: reader, subjectId, fields: ['observedText'] };
}

test('market and result decisions use signed quotes rather than matching vocabulary', async () => {
  const scope = await binding('market-scope', 'serves', 'https://example.org/service', 'Õnnestus!');
  const capability = await binding('task-capability', 'supports', 'https://example.org/service', 'Õnnestus!');
  assert.equal((await assessMarketSource('https://example.org/service', { scope, capability })).eligible, true);
  assert.equal((await assessMarketSource('https://example.org/service')).scope.decision, 'unclear');
  const search = await binding('search-result-role', 'task-source', 'https://example.org/service', 'Õnnestus!');
  assert.deepEqual((await judgedSearchTargets([{ url: 'https://example.org/service', text: observed }], url => url === search.subjectId ? search : undefined)).targets,
    ['https://example.org/service']);
  const unknown = await judgedSearchTargets([{ url: 'https://example.org/service', text: observed }]);
  assert.deepEqual(unknown.targets, []);
  assert.equal(unknown.limitations.length, 1);
});

test('unjudged access, query, language, target, link and mood claim report limitations', async () => {
  const url = 'https://example.org/service';
  assert.equal((await assessPageAccess(url)).decision, 'unclear');
  assert.equal((await assessDiscoveryQuery('Õnnestus!')).decision, 'unclear');
  assert.equal((await assessSourceLanguage(url)).decision, 'unclear');
  assert.equal((await assessDiscoveryTarget(url)).decision, 'unclear');
  assert.equal((await assessMoodClaim('statement-1')).decision, 'unclear');
  const links = await judgedObservedLinkTargets([{ url, text: observed }]);
  assert.deepEqual(links.targets, []);
  assert.equal(links.limitations.length, 1);
  const access = await binding('page-access', 'content', url);
  assert.equal((await assessPageAccess(url, access)).decision, 'content');
  const link = await binding('link-role', 'task-source', url);
  assert.deepEqual((await judgedObservedLinkTargets([{ url, text: observed }], () => link)).targets, [url]);
});

test('fabricated and stale reference judgments never become advisory approval', async () => {
  const valid = await binding('market-scope', 'serves', 'https://example.org/service');
  await assert.rejects(referenceDecision('market-scope', { ...valid, context: { ...valid.context,
    resolve: async (ref, field, itemId) => ({ ...await valid.context.resolve(ref, field, itemId), text: 'No cited words here' }) } }), /AI_JUDGMENT_QUOTE_MISMATCH/);
  await assert.rejects(referenceDecision('market-scope', { ...valid, context: { ...valid.context, documentSha256: hash('changed') } }), /AI_JUDGMENT_CONTEXT_MISMATCH/);
  await assert.rejects(referenceDecision('reference-action'), /AI_JUDGMENT_REQUIRED/);
  await assert.rejects(referenceDecision('overlay-action'), /AI_JUDGMENT_REQUIRED/);
});
