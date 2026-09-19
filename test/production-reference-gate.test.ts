import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { checkProductionReadiness } from '../core/runtime/production-reference-gate.ts';
import { contractSha256, deliveryReceipt } from '../core/stage/contract.ts';
import { copyDeckSha256 } from '../core/copy/index.ts';
import { createTestProjectRunInvocation, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pack = join(repo, 'core');
const project = () => mkdtempSync(join(tmpdir(), 'omd-production-readiness-'));
const fixture = (name: string) => JSON.parse(readFileSync(join(repo, 'test/fixtures/adaptive-flow', `${name}.json`), 'utf8'));
const write = (root: string, path: string, text: string) => writeFileSync(join(root, path), text);
const deck = `# Copy deck
## Sources and fact ledger
| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | User brief | The confirmation sentence is approved. |
## Audience language
The user wants to see the confirmation.
## Voice contract
- Audience: Current users
- Language: en
- Register: direct
- Breath: One message per sentence
## Truth contract
- Result boundary: navigation
- Storage boundary: none
## Surface copy
### Confirmation
- Main message: Read your confirmation.
- Supporting fact: This is the approved confirmation sentence.
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
const review = (body: string, verdict = 'CLEAN') => `Mode: copy-editor
Review time: 2026-09-20T00:00:00Z
Reviewed copy-deck SHA-256: ${copyDeckSha256(Buffer.from(body))}
Verdict: ${verdict}
Findings: Same-session fixture review; no authorship attestation.
`;

function readyCopyProject() {
  const root = project();
  const invocation = publishTestAdaptiveRoute(root, fixture('copy-only'));
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  const evidence = [{ status: 'user-provided', reference: 'message-1' }];
  const statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1', excerpt: 'Fix the approved confirmation sentence only.' }] });
  write(root, '.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1', request: 'Fix the approved confirmation sentence only.', domain: 'Confirmation',
    summary: 'One approved sentence in an existing product.',
    surfaces: [{ name: 'Confirmation', purpose: 'Read the approved sentence', evidence }],
    coreObjects: [{ name: 'Confirmation', evidence }], audience: { description: 'Existing users', evidence },
    referenceQueries: { component: ['existing confirmation'], craft: ['existing typography'], mood: ['existing product voice'] },
    planning: { businessGoal: statement('Fix approved copy'), successSignal: statement('Approved sentence is visible'), nonGoals: [statement('Do not change layout or behavior')] },
  }));
  write(root, '.omd/copy-deck.md', deck);
  write(root, '.omd/.cache/copy-eye.md', review(deck));
  write(root, '.omd/delivery.jsonl', [
    deliveryReceipt('domain', 'protocol/domain-analysis.md', contractSha256(pack, 'protocol/domain-analysis.md'), '2026-09-20T00:00:00Z'),
    ...['protocol/copy-deck.md', 'theory/voice.md'].map(contract => deliveryReceipt('copy', contract, contractSha256(pack, contract), '2026-09-20T00:00:00Z')),
  ].map(receipt => JSON.stringify(receipt)).join('\n') + '\n');
  return { root, invocation };
}

test('authenticated pointer is required, with no productionOwnerRole environment bypass', () => {
  const root = project();
  const invocation = createTestProjectRunInvocation(root);
  const missing = checkProductionReadiness(root, invocation, pack);
  assert.equal(missing.ok, false);
  write(root, '.omd/route.json', JSON.stringify({ projectMode: 'existing' }));
  assert.equal(checkProductionReadiness(root, invocation, pack).ok, false);
});

test('valid copy-only inputs pass without forcing skipped research, type, candidates or pre-existing app renders', () => {
  const { root, invocation } = readyCopyProject();
  const result = checkProductionReadiness(root, invocation, pack, 'src/copy/confirmation.ts');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.ok, true);
  assert.equal(checkProductionReadiness(root, invocation, pack, 'src/unrequested.ts').ok, false);
});

test('file presence cannot substitute for copy validation, current CLEAN review or contract delivery', () => {
  const { root, invocation } = readyCopyProject();
  write(root, '.omd/.cache/copy-eye.md', review(deck, 'REVISE'));
  assert.match(checkProductionReadiness(root, invocation, pack).blockers.join('\n'), /CLEAN/);
  write(root, '.omd/.cache/copy-eye.md', review(deck));
  write(root, '.omd/copy-deck.md', deck + '\nChanged after review.\n');
  assert.match(checkProductionReadiness(root, invocation, pack).blockers.join('\n'), /current copy-deck bytes/);
  write(root, '.omd/copy-deck.md', '{}');
  assert.match(checkProductionReadiness(root, invocation, pack).blockers.join('\n'), /Missing required section/);
  write(root, '.omd/copy-deck.md', deck);
  write(root, '.omd/delivery.jsonl', '');
  assert.match(checkProductionReadiness(root, invocation, pack).blockers.join('\n'), /contract not delivered/);
});

test('new-product editorial relabel, unresolved board, missing copy/composition and candidate stub all remain blocked', () => {
  const root = project();
  const invocation = publishTestAdaptiveRoute(root, fixture('medical-new-product'));
  mkdirSync(join(root, '.omd/.cache/sketches/fake-selected'), { recursive: true });
  write(root, '.omd/frame.md', '---\nuxSurface: editorial\n---\n# Frame\n');
  write(root, '.omd/reference-board.json', '{}');
  write(root, '.omd/.cache/sketches/fake-selected/index.html', '<p>not selection evidence</p>');
  const result = checkProductionReadiness(root, invocation, pack);
  assert.equal(result.ok, false);
  const reasons = result.blockers.join('\n');
  for (const pattern of [/product\/mixed/, /reference board\/judgment:/, /copy-deck/, /composition/, /current candidate selection/]) assert.match(reasons, pattern);
});

test('real local CLI transport rejects missing inputs and design-only source writes without asking for activation', () => {
  const root = project();
  const cli = join(repo, 'bin/omd.mjs');
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  write(root, 'route-input.json', JSON.stringify(fixture('copy-only')));
  const publish = run('route', 'classify', '--input', 'route-input.json', '--json');
  assert.equal(publish.status, 0, publish.stderr);
  const missing = run('guard', 'production', '--path', 'src/copy/confirmation.ts', '--json');
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stdout, /copy-deck/);
  assert.doesNotMatch(missing.stdout, /ROUTE_AUTHORITY_REQUIRED/);
  const completion = run('guard', 'completion', '--json');
  assert.equal(completion.status, 1);
  assert.match(completion.stdout, /copy-deck/);
  write(root, 'route-input.json', JSON.stringify(fixture('design-only-test007')));
  const design = run('route', 'classify', '--input', 'route-input.json', '--json');
  assert.equal(design.status, 0, design.stderr);
  const blocked = run('guard', 'production', '--path', 'src/app.jsx', '--json');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /production is not selected/);
  const handoff = run('guard', 'completion', '--json');
  assert.equal(handoff.status, 1);
  assert.match(handoff.stderr, /design-handoff/);
  assert.doesNotMatch(handoff.stderr, /final-evidence|host-issued-invocation/);
});
