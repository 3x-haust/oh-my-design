import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import { sha256 } from '../../core/ref/board-artifacts.ts';
import { publishAdaptiveRoute } from '../../core/route/adaptive-route-persistence.ts';
import { createTestNativePiInvocation } from '../../core/runtime/native-pi-run.ts';
import { createProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import { contractSha256, deliveryReceipt } from '../../core/stage/contract.ts';
import { copyDeckSha256 } from '../../core/copy/index.ts';
import type { DeveloperEvaluationSnapshot } from '../../core/coach/developer-evaluation-contract.ts';

export const repo = fileURLToPath(new URL('../..', import.meta.url));
export const packRoot = join(repo, 'core');
const cliPath = join(repo, 'test/fixtures/pi-study-rpc.mjs');
export const nodePath = realpathSync(process.execPath);
export const input = { schema: 'native-maker-input-v1', role: 'omd-hand', candidateId: null,
  paths: ['src/copy/confirmation.ts', 'src/copy/label.ts'], readPaths: [], axis: null };

export function fixture(t: TestContext, mode = 'success', calibration?: DeveloperEvaluationSnapshot) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-maker-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prior = process.env.PI_STUDY_FIXTURE_MODE;
  process.env.PI_STUDY_FIXTURE_MODE = mode;
  t.after(() => {
    if (prior === undefined) delete process.env.PI_STUDY_FIXTURE_MODE;
    else process.env.PI_STUDY_FIXTURE_MODE = prior;
  });
  const invocation = createTestNativePiInvocation({ root, ...(calibration === undefined ? {} : { calibration }), host: {
    nodePath, nodeSha256: sha256(readFileSync(nodePath)), cliPath, cliSha256: sha256(readFileSync(cliPath)),
    provider: mode === 'provider-projection' ? 'chatgpt-subscription' : 'fixture-provider',
    model: 'fixture-maker-model', thinkingLevel: 'high', parentSessionId: 'source-aware-parent',
  } });
  const writer = createProjectWriteAdapter(root, invocation);
  const routeInput = JSON.parse(readFileSync(join(repo, 'test/fixtures/adaptive-flow/copy-only.json'), 'utf8'));
  routeInput.request += ' Use https://quarantined.example/original only as a visual reference.';
  publishAdaptiveRoute(root, routeInput, writer, invocation);
  const statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence',
    source: 'user-message', reference: 'message-1', excerpt: routeInput.request }] });
  const evidence = [{ status: 'user-provided', reference: 'message-1' }];
  writer.write('.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1', request: routeInput.request, domain: 'Confirmation',
    summary: 'One approved sentence.', surfaces: [{ name: 'Confirmation', purpose: 'Read confirmation', evidence }],
    coreObjects: [{ name: 'Confirmation', evidence }], audience: { description: 'Existing users', evidence },
    referenceQueries: { component: ['confirmation'], craft: ['typography'], mood: ['direct'] },
    planning: { businessGoal: statement('Fix copy'), successSignal: statement('Approved sentence is visible'),
      nonGoals: [statement('Do not change behavior')] },
  }));
  const deck = `# Copy deck
## Sources and fact ledger
| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | User brief | The confirmation sentence is approved. |
## Audience language
Existing users want confirmation.
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
Read aloud.
`;
  writer.write('.omd/copy-deck.md', deck);
  writer.write('.omd/.cache/copy-eye.md', `Mode: copy-editor
Review time: 2026-09-20T00:00:00Z
Reviewed copy-deck SHA-256: ${copyDeckSha256(Buffer.from(deck))}
Verdict: CLEAN
Findings: Fixture review.
`);
  writer.write('.omd/delivery.jsonl', ([
    ['domain', 'protocol/domain-analysis.md'],
    ['copy', 'protocol/copy-deck.md'], ['copy', 'theory/voice.md'],
  ] as const).map(([stage, contract]) => {
    assert.ok(stage && contract);
    return JSON.stringify(deliveryReceipt(stage, contract, contractSha256(packRoot, contract), '2026-09-20T00:00:00Z'));
  }).join('\n') + '\n');
  mkdirSync(join(root, 'src/copy'), { recursive: true });
  writeFileSync(join(root, 'src/copy/confirmation.ts'), 'export const confirmation = "old";');
  writer.write('.omd/.cache/private-verdict.json', '{"secret":"PRIVATE_VERDICT_SENTINEL"}');
  writer.write('.omd/briefs/production.json', '{"secret":"RAW_PRODUCTION_BRIEF_SENTINEL"}');
  writeFileSync(join(root, 'AGENTS.md'), 'AMBIENT_PROJECT_SENTINEL');
  return { root, invocation, packRoot, input, routeInput, writer };
}
