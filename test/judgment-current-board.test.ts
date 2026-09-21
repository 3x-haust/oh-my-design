import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { parseDesignJudgmentRecord } from '../core/design/judgment.ts';
import { readReferenceBoardArtifacts, sha256 } from '../core/ref/board-artifacts.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { buildBrief } from '../core/brief/index.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const judgment = (referenceBoardSha256: string) => ({
  schema: 'design-judgment-v1', referenceBoardSha256,
  hypothesis: {
    schema: 'design-judgment-v1', feelsLike: 'a personal administrative workspace, not a portal',
    dominantObject: 'benefit comparison cards', subordinate: ['navigation'],
    densityIntent: 'Show multiple comparable benefits within the viewport.',
    trustSource: 'Explicit provider and deadline metadata', twoSecondRead: 'Find benefits that fit me',
  },
  judgments: [{ id: 'hero', observation: 'A heading anchors the scoped work object.', whyItWorksThere: 'The task starts with identifying the work object.',
    relevance: 'high', adopt: ['Visible work object'], reject: ['Unrelated branding'], interpretation: 'Anchor the benefits comparison.', scope: 'surface' }],
});

test('the public design-judgment skeleton can author a record accepted by the actual publisher', t => {
  const f = designAdmissionFixture(t);
  const schema = inputSkeleton('design-judgment');
  assert.equal(schema.path, '.omd/.cache/design-judgment-input.json');
  const record = judgment(sha256(readReferenceBoardArtifacts(f.root).boardBytes));
  assert.deepEqual(schema.keys.slice().sort(), Object.keys(record).sort());
  const authored = { ...schema.skeleton as object, ...record };
  const pointer = publishDesignJudgment(f.root, parseDesignJudgmentRecord(authored), f.writer);
  assert.equal(pointer.referenceBoardSha256, record.referenceBoardSha256);
});

test('judgment check refuses a changed board and passes only a newly interpreted current board', t => {
  const f = designAdmissionFixture(t);
  const run = () => spawnSync(process.execPath, [cli, 'judgment', 'check', '--json'], { cwd: f.root, encoding: 'utf8' });
  const publishCurrent = () => publishDesignJudgment(f.root, judgment(sha256(readReferenceBoardArtifacts(f.root).boardBytes)), f.writer);
  publishCurrent();
  assert.equal(run().status, 0);
  const before = readFileSync(join(f.root, '.omd/design-judgment.json'));
  f.board.candidates[0]!.rationale = 'Changed composition decision.';
  f.refreshBoard();
  assert.ok(buildBrief(f.root, 'composition').blockers.some(blocker => blocker.includes('DESIGN_JUDGMENT_STALE')),
    'composition entry must expose the same current-board failure as judgment check');
  const stale = run();
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout + stale.stderr, /DESIGN_JUDGMENT_STALE/);
  assert.deepEqual(readFileSync(join(f.root, '.omd/design-judgment.json')), before);
  publishCurrent();
  assert.equal(run().status, 0);
});

test('judgment input supplies the exact interpreted board identity without writing a verdict', t => {
  const f = designAdmissionFixture(t);
  const result = spawnSync(process.execPath, [cli, 'judgment', 'input', '--json'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const input = JSON.parse(result.stdout);
  assert.equal(input.referenceBoardSha256, sha256(readReferenceBoardArtifacts(f.root).boardBytes));
  assert.equal(input.board.candidates[0].pieces[0].slotId, 'hero');
  assert.equal(input.judgments, undefined);
});
