import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { checkBriefEntry } from '../core/brief/entry.ts';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
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

function readyCopyProject(input = fixture('copy-only')) {
  const root = project();
  const invocation = publishTestAdaptiveRoute(root, input);
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  const evidence = [{ status: 'user-provided', reference: 'message-1' }];
  const statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1', excerpt: 'Fix the approved confirmation sentence only.' }] });
  write(root, '.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1', request: input.request, domain: 'Confirmation',
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
  return { root, invocation, input };
}

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const runCli = (root: string, ...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
function readyCliCopyProject(input = fixture('copy-only')) {
  const ready = readyCopyProject(input);
  write(ready.root, '.omd/.cache/route-input.json', JSON.stringify(input));
  const result = runCli(ready.root, 'route', 'classify', '--input', '.omd/.cache/route-input.json', '--json');
  assert.equal(result.status, 0, result.stderr);
  return ready;
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

test('stage entry connects selected procedure to actual current validation, not a cached successful brief', () => {
  const { root, invocation } = readyCopyProject();
  const inspection = buildBrief(root, 'production', pack, invocation);
  assert.deepEqual(inspection.entryGate, {
    command: 'omd brief production --check --json', selected: true,
    runBy: 'coordinator', passMeans: 'current-entry-inputs-only',
  });
  assert.match(formatBrief(inspection), /entry gate.*omd brief production --check/);
  assert.equal(checkBriefEntry(root, 'production', pack, invocation).blockers.length, 0);
  assert.equal(checkBriefEntry(root, 'copy', pack, invocation).blockers.length, 0);
  const copy = buildBrief(root, 'copy', pack, invocation);
  assert.ok(copy.judgedBy.some(check => check.command === 'omd copy --review-check'));
  assert.match(checkBriefEntry(root, 'scout', pack, invocation).blockers.join('\n'), /stage is not selected/);
  write(root, '.omd/copy-deck.md', deck + '\nChanged since review.\n');
  assert.equal(buildBrief(root, 'production', pack, invocation).blockers.length, 0);
  assert.match(checkBriefEntry(root, 'production', pack, invocation).blockers.join('\n'), /current copy-deck bytes/);
});

test('CLI stage entry refuses missing, unselected and stale inputs while inspection and repaired entry remain available', () => {
  const { root } = readyCliCopyProject();
  const checked = (...args: string[]) => runCli(root, 'brief', ...args, '--json');
  assert.equal(checked('copy', '--check').status, 0);
  assert.equal(checked('production', '--check').status, 0);
  const skipped = checked('scout', '--check');
  assert.equal(skipped.status, 1);
  assert.match(skipped.stdout, /stage is not selected/);
  assert.equal(checked('scout').status, 0, 'unselected-stage inspection stays available');
  write(root, '.omd/copy-deck.md', deck + '\nNew bytes.\n');
  assert.equal(checked('production').status, 0);
  const stale = checked('production', '--check');
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /current copy-deck bytes/);
  write(root, '.omd/copy-deck.md', deck);
  assert.equal(checked('production', '--check').status, 0);
  write(root, '.omd/delivery.jsonl', '');
  const missing = checked('copy', '--check');
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /contract not delivered/);
});

test('copy entry does not require the output it is about to author or skipped downstream work', () => {
  const { root, invocation } = readyCopyProject();
  unlinkSync(join(root, '.omd/copy-deck.md'));
  unlinkSync(join(root, '.omd/.cache/copy-eye.md'));
  assert.deepEqual(checkBriefEntry(root, 'copy', pack, invocation).blockers, []);
  assert.ok(checkBriefEntry(root, 'production', pack, invocation).blockers.length > 0);
  assert.equal(buildBrief(project(), 'copy').judgedBy.some(check => check.command === 'omd copy --review-check'), false);
});

test('source path gates reject target symlinks even when both paths are in route scope', () => {
  const { root, invocation } = readyCopyProject();
  mkdirSync(join(root, 'src/copy'), { recursive: true });
  write(root, 'src/copy/current.ts', 'export const text = "current";');
  symlinkSync(join(root, 'src/copy/current.ts'), join(root, 'src/copy/alias.ts'));
  assert.match(checkProductionReadiness(root, invocation, pack, ['src/copy/new.ts', 'src/copy/alias.ts']).blockers.join('\n'), /symlink target\/ancestor/);
  assert.equal(checkProductionReadiness(root, invocation, pack, ['src/copy/new.ts', 'src/copy/current.ts']).ok, true);
});

test('direct routed recipe CLI refuses stale inputs before writes and succeeds after current evidence is restored', () => {
  const { root } = readyCliCopyProject();
  const output = join(root, 'src/copy/recipe');
  write(root, '.omd/copy-deck.md', deck + '\nStale review.\n');
  const blocked = runCli(root, 'recipe', 'add', 'scroll-reveal', '--out', output, '--json');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /OMD_PRODUCTION_BLOCKED/);
  assert.match(blocked.stderr, /current copy-deck bytes/);
  assert.equal(existsSync(output), false);
  assert.equal(runCli(root, 'recipe', 'show', 'scroll-reveal', '--json').status, 0);
  write(root, '.omd/copy-deck.md', deck);
  const installed = runCli(root, 'recipe', 'add', 'scroll-reveal', '--out', output, '--json');
  assert.equal(installed.status, 0, installed.stderr);
  const written = JSON.parse(installed.stdout).written as string[];
  assert.ok(written.length > 1);
  assert.ok(written.every(path => existsSync(path)));
});

test('all recipe targets are checked before any write; symlink redirection cannot escape a narrow route', () => {
  const input = fixture('copy-only');
  input.allowedPaths = ['src/copy/scroll-reveal.css'];
  const { root } = readyCliCopyProject(input);
  const refused = runCli(root, 'recipe', 'add', 'scroll-reveal', '--out', 'src/copy', '--json');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /target is outside the current route/);
  assert.equal(existsSync(join(root, 'src')), false);
  const other = readyCliCopyProject();
  mkdirSync(join(other.root, 'src/copy'), { recursive: true });
  mkdirSync(join(other.root, 'outside-route'));
  symlinkSync(join(other.root, 'outside-route'), join(other.root, 'src/copy/link'));
  const redirected = runCli(other.root, 'recipe', 'add', 'scroll-reveal', '--out', 'src/copy/link', '--json');
  assert.equal(redirected.status, 1);
  assert.match(redirected.stderr, /target is outside the current route/);
  assert.equal(existsSync(join(other.root, 'outside-route/scroll-reveal.css')), false);
});

test('standalone recipe use does not silently activate an OMD design workflow', () => {
  const root = project();
  const installed = runCli(root, 'recipe', 'add', 'scroll-reveal', '--json');
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(existsSync(join(root, '.omd/route.json')), false);
  assert.ok(JSON.parse(installed.stdout).written.every((path: string) => existsSync(path)));
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

test('new-product frame and safety remain hard while unresolved board and candidate stub are debt', () => {
  const root = project();
  const invocation = publishTestAdaptiveRoute(root, fixture('medical-new-product'));
  mkdirSync(join(root, '.omd/.cache/sketches/fake-selected'), { recursive: true });
  write(root, '.omd/frame.md', '---\nuxSurface: editorial\n---\n# Frame\n');
  write(root, '.omd/reference-board.json', '{}');
  write(root, '.omd/.cache/sketches/fake-selected/index.html', '<p>not selection evidence</p>');
  const result = checkProductionReadiness(root, invocation, pack);
  assert.equal(result.ok, false);
  const reasons = result.blockers.join('\n');
  // Phase 1 preserves safety and real task framing, not acquisition as an infinite source gate.
  for (const pattern of [/product\/mixed/, /copy-deck/, /composition/]) assert.match(reasons, pattern);
  assert.ok(result.confidenceDebt.some(item => item.stage === 'reference-board'));
  assert.ok(result.confidenceDebt.some(item => item.stage === 'candidate-generation'));
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
