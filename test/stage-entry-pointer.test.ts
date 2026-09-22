import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { copyDeckSha256 } from '../core/copy/index.ts';
import { contractSha256, deliveryReceipt, stageDefinition } from '../core/stage/contract.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { designJudgmentInput } from '../core/design/current-judgment.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { publishReferenceResearch } from '../core/ref/reference-research.ts';
import { publishReferenceApplication, referenceApplicationPlan } from '../core/ref/reference-application.ts';

const pack = fileURLToPath(new URL('../core', import.meta.url));
const deck = `# Copy deck
## Sources and fact ledger
| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | User request | The confirmation sentence is approved. |
## Audience language
The user wants to read the confirmation.
## Voice contract
- Audience: Existing users
- Language: en
- Register: direct
- Breath: One message per sentence
## Truth contract
- Result boundary: navigation
- Storage boundary: none
## Surface copy
### Confirmation
- Main message: Read your confirmation.
- Supporting fact: The confirmation sentence is approved.
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
Read aloud; one next action and direct language.
`;

const routeInput = () => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
function copyProject(root: string, input = routeInput()) {
  const invocation = publishTestAdaptiveRoute(root, input);
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  const evidence = [{ status: 'user-provided', reference: 'request' }];
  const statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: input.request }] });
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify({
    schema: 'domain-brief-v1', request: input.request, domain: 'Confirmation', summary: 'Approved copy correction.',
    surfaces: [{ name: 'Confirmation', purpose: 'Read approved copy', evidence }], coreObjects: [{ name: 'Confirmation', evidence }],
    audience: { description: 'Existing users', evidence }, referenceQueries: { component: ['confirmation'], craft: ['existing type'], mood: ['existing voice'] },
    planning: { businessGoal: statement('Fix approved copy'), successSignal: statement('Approved sentence visible'), nonGoals: [statement('No layout changes')] },
  }));
  writeFileSync(join(root, '.omd/copy-deck.md'), deck);
  writeFileSync(join(root, '.omd/.cache/copy-eye.md'), `Mode: copy-editor\nReview time: 2026-09-21T00:00:00Z\nReviewed copy-deck SHA-256: ${copyDeckSha256(Buffer.from(deck))}\nVerdict: CLEAN\nFindings: Same-session fixture, no independent attestation.\n`);
  return invocation;
}

test('next work repairs missing entry receipts even when every selected output is valid', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-stage-entry-pointer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocation = copyProject(root);
  const before = readFileSync(join(root, '.omd/copy-deck.md'));
  const missing = nextStageWork(root, pack, invocation);
  assert.equal(missing.stage, 'domain');
  assert.ok(missing.entryBlockers.some(blocker => blocker.includes('protocol/domain-analysis.md')));
  assert.deepEqual(missing.progress.validatedStages, []);
  assert.deepEqual(readFileSync(join(root, '.omd/copy-deck.md')), before);

  const receipts = [deliveryReceipt('domain', 'protocol/domain-analysis.md', contractSha256(pack, 'protocol/domain-analysis.md'), '2026-09-21T00:00:00Z')];
  const deliver = () => writeFileSync(join(root, '.omd/delivery.jsonl'), receipts.map(receipt => JSON.stringify(receipt)).join('\n') + '\n');
  deliver();
  const copy = nextStageWork(root, pack, invocation);
  assert.equal(copy.stage, 'copy');
  assert.deepEqual(copy.progress.validatedStages, ['domain']);
  for (const contract of ['protocol/copy-deck.md', 'theory/voice.md']) receipts.push(deliveryReceipt('copy', contract, contractSha256(pack, contract), '2026-09-21T00:00:00Z'));
  deliver();
  const ready = nextStageWork(root, pack, invocation);
  assert.equal(ready.stage, null);
  assert.deepEqual(ready.progress.validatedStages, ['domain', 'copy']);
  assert.deepEqual(ready.entryBlockers, []);
});

test('current reference outputs lead to coordinator interpretation, not an ownerless terminal pointer', t => {
  const f = designAdmissionFixture(t);
  const input = routeInput();
  input.strategyDecision.stages.splice(1, 0, 'scout', 'reference-board');
  input.strategyDecision.roles.unshift('omd-scout');
  input.strategyDecision.executionWaves.unshift({ id: 'reference', mode: 'concurrent', roles: ['omd-scout'] });
  input.strategyDecision.skips = input.strategyDecision.skips.filter((skip: { id: string }) => !['scout', 'reference-board'].includes(skip.id));
  const invocation = copyProject(f.root, input);
  writeFileSync(join(f.root, '.omd/scout.md'), '# Scoped reference observations\n');
  const receipts = (['domain', 'scout', 'reference-board', 'copy'] as const).flatMap(stage => stageDefinition(stage).requiredContracts.map(contract =>
    deliveryReceipt(stage, contract, contractSha256(pack, contract), '2026-09-21T00:00:00Z')));
  writeFileSync(join(f.root, '.omd/delivery.jsonl'), receipts.map(receipt => JSON.stringify(receipt)).join('\n') + '\n');
  const work = nextStageWork(f.root, pack, invocation);
  assert.equal(work.owner, 'coordinator');
  assert.equal(work.action, 'interpret-references');
  assert.equal(work.next, 'omd judgment input --json');
  assert.ok(work.schemas.some(schema => schema.name === 'design-judgment'));
  publishDesignJudgment(f.root, {
    schema: 'design-judgment-v1', referenceBoardSha256: designJudgmentInput(f.root).referenceBoardSha256,
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'a personal confirmation workspace, not a portal',
      dominantObject: 'confirmation record', subordinate: ['navigation'], densityIntent: 'One readable confirmation per viewport',
      trustSource: 'Explicit state metadata', twoSecondRead: 'Read the approved confirmation sentence' },
    judgments: [{ id: 'hero', observation: 'The heading anchors the work object.', whyItWorksThere: 'The task starts by locating its record.',
      relevance: 'high', adopt: ['Visible record'], reject: ['Source branding'], interpretation: 'Anchor confirmation content.', scope: 'surface' }],
  }, f.writer);
  assert.equal(nextStageWork(f.root, pack, invocation).stage, null);
  f.board.candidates[0]!.rationale = 'Revised reference decision.';
  f.refreshBoard();
  assert.equal(nextStageWork(f.root, pack, invocation).action, 'interpret-references');
});

test('a missing reference board points to discovery work instead of repeating entry checks', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-stage-reference-pointer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = routeInput();
  input.referenceDiscovery = { ...input.referenceDiscovery, uncertainty: 'unresolved', existingEvidence: 'none', existingEvidenceUse: null, skipReason: null };
  input.strategyDecision.stages.splice(1, 0, 'scout', 'reference-board');
  input.strategyDecision.roles.unshift('omd-scout');
  input.strategyDecision.executionWaves[0].roles.unshift('omd-scout');
  input.strategyDecision.methods.push('reference-discovery', 'parallel-reference-acquisition');
  input.strategyDecision.skips = input.strategyDecision.skips.filter((skip: { id: string }) => !['scout', 'reference-board', 'reference-discovery'].includes(skip.id));
  const invocation = copyProject(root, input);
  writeFileSync(join(root, '.omd/scout.md'), '# Scoped reference observations\n');
  const receipts = (['domain', 'scout', 'reference-board'] as const).flatMap(stage => stageDefinition(stage).requiredContracts.map(contract =>
    deliveryReceipt(stage, contract, contractSha256(pack, contract), '2026-09-21T00:00:00Z')));
  writeFileSync(join(root, '.omd/delivery.jsonl'), receipts.map(receipt => JSON.stringify(receipt)).join('\n') + '\n');

  const work = nextStageWork(root, pack, invocation);
  assert.equal(work.stage, 'reference-board');
  assert.equal(work.action, 'author-output');
  assert.equal(work.next, 'omd ref discover-plan --json');
  assert.match(work.instruction, /multiple real domain-service flows/);
  assert.match(work.instruction, /Run checks only after the owned board artifact changes/);
});

test('board work repairs research before application and returns to research when a retained receipt changes', t => {
  const f = designAdmissionFixture(t), input = routeInput();
  input.referenceDiscovery = { ...input.referenceDiscovery, uncertainty: 'unresolved', existingEvidence: 'none', existingEvidenceUse: null, skipReason: null };
  input.strategyDecision.stages.splice(1, 0, 'scout', 'reference-board');
  input.strategyDecision.roles.unshift('omd-scout');
  input.strategyDecision.executionWaves[0].roles.unshift('omd-scout');
  input.strategyDecision.methods.push('reference-discovery', 'parallel-reference-acquisition');
  input.strategyDecision.skips = input.strategyDecision.skips.filter((skip: { id: string }) => !['scout', 'reference-board', 'reference-discovery'].includes(skip.id));
  const invocation = copyProject(f.root, input), route = readPersistedRoute(f.root, invocation);
  const options = { expectedSourceContractSha256: route.sourceContractSha256, benchmarkRequired: false, expectedRequest: route.request };
  const writer = createTestProjectWriteAdapter(f.root, invocation);
  writeFileSync(join(f.root, '.omd/scout.md'), '# Scoped reference observations\n');
  const receipts = (['domain', 'scout', 'reference-board', 'copy'] as const).flatMap(stage => stageDefinition(stage).requiredContracts.map(contract =>
    deliveryReceipt(stage, contract, contractSha256(pack, contract), '2026-09-21T00:00:00Z')));
  writeFileSync(join(f.root, '.omd/delivery.jsonl'), receipts.map(receipt => JSON.stringify(receipt)).join('\n') + '\n');
  const boardBefore = readFileSync(f.boardPath);
  const researchWork = nextStageWork(f.root, pack, invocation);
  assert.equal(researchWork.stage, 'reference-board');
  assert.equal(researchWork.action, 'author-research');
  assert.equal(researchWork.next, 'omd schema reference-research');
  assert.match(researchWork.problems.join('\n'), /REFERENCE_RESEARCH_MISSING/);
  assert.deepEqual(researchWork.entryBlockers, []);
  assert.deepEqual(readFileSync(f.boardPath), boardBefore);

  f.research.sourceContractSha256 = route.sourceContractSha256;
  publishReferenceResearch(f.root, f.research, options, writer);
  const applicationWork = nextStageWork(f.root, pack, invocation);
  assert.equal(applicationWork.action, 'apply-references');
  assert.equal(applicationWork.next, 'omd ref apply-plan --json');
  const plan = referenceApplicationPlan(f.root, options).input;
  const lane = (id: string) => ({ referenceIds: [id], coverage: 'direct', gap: null,
    application: 'Anchor the confirmation record.', doNotTransfer: 'Source branding and claims.', reason: 'Readers need their current record first.' });
  publishReferenceApplication(f.root, { ...plan, screens: plan.screens.map(row => ({ ...row,
    target: { route: '/confirmation', state: 'initial' }, domain: lane('domain-1'), design: lane('visual'), checks: ['Record heading is visible.'] })) }, options, writer);
  assert.equal(nextStageWork(f.root, pack, invocation).action, 'interpret-references');
  const applicationBefore = readFileSync(join(f.root, '.omd/reference-application.json'));
  const captureBefore = readFileSync(f.source.path);
  writeFileSync(f.source.path, Buffer.concat([captureBefore, Buffer.from('\n')]));
  const stale = nextStageWork(f.root, pack, invocation);
  assert.equal(stale.action, 'author-research');
  assert.match(stale.problems.join('\n'), /REFERENCE_RESEARCH_EVIDENCE_STALE/);
  assert.ok(!stale.progress.validatedStages.includes('reference-board'));
  assert.deepEqual(readFileSync(join(f.root, '.omd/reference-application.json')), applicationBefore);
  writeFileSync(f.source.path, captureBefore);
  assert.equal(nextStageWork(f.root, pack, invocation).action, 'interpret-references');
});
