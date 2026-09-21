import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { captureSlopCheckpoint, publishSlopReview, checkSlopReview, parseSlopScope } from '../core/slop/review.ts';

const html = (transition = 'color') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Order review</title><style>body{font-family:Arial,sans-serif;color:#172128;background:#fff;padding:24px}button{transition:${transition} 120ms ease;padding:12px 18px;color:white;background:#183c52}</style></head><body><main><h1>Review your order</h1><p>Check your delivery address and the items below before confirming your order. You can return to the basket to make changes.</p><button>Return to basket</button></main></body></html>`;
const scope = { schema: 'slop-scope-v1', views: [
  { id: 'desktop', page: 'index.html', viewport: { width: 1280, height: 900 } },
  { id: 'mobile', page: 'index.html', viewport: { width: 390, height: 844 } },
] };
function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-slop-review-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'index.html'), html());
  return { root, writer: createTestProjectWriteAdapter(root) };
}
function dismiss(input: Awaited<ReturnType<typeof captureSlopCheckpoint>>) {
  return { ...input.reviewInput, summary: 'Synthetic order review: inspect the clear heading and single basket action in both viewport captures.',
    decisions: input.reviewInput.decisions.map(decision => ({ ...decision, status: 'dismissed' as const,
      reason: `The captured order task intentionally retains this treatment (${input.findings.find(f => f.id === decision.id)!.rule}); it does not obscure the basket action.`, viewIds: ['desktop', 'mobile'] })) };
}

test('current native source/render checkpoint and individual dismissals close a loop; images and sources stay bound', async t => {
  const { root, writer } = fixture(t);
  assert.throws(() => checkSlopReview(root), /missing loop/);
  const captured = await captureSlopCheckpoint(root, scope, writer);
  assert.throws(() => checkSlopReview(root), /no rendered review/);
  await assert.rejects(captureSlopCheckpoint(root, scope, writer), /triage the previous/);
  const review = dismiss(captured);
  if (review.decisions.length) assert.throws(() => publishSlopReview(root, { ...review, decisions: [] }, writer), /every source candidate/);
  publishSlopReview(root, review, writer);
  assert.equal(checkSlopReview(root, [{ page: 'index.html', width: 390, height: 844 }]).rounds, 1);
  assert.throws(() => checkSlopReview(root, [{ page: 'other.html', width: 390, height: 844 }]), /final production entry/);
  const checkpoint = JSON.parse(readFileSync(join(root, captured.checkpoint.path), 'utf8'));
  const image = checkpoint.views[0].image.path;
  writeFileSync(join(root, image), 'not the captured PNG');
  assert.throws(() => checkSlopReview(root), /stale evidence/);
});

test('confirmed source problem requires changed source, equal-scope native rescan and after-render resolution', async t => {
  const { root, writer } = fixture(t);
  writeFileSync(join(root, 'index.html'), html('all'));
  const first = await captureSlopCheckpoint(root, scope, writer);
  const review = dismiss(first);
  const candidate = first.findings.find(f => f.rule === 'all-property-transition')!;
  assert.ok(candidate);
  const triage = { ...review, decisions: review.decisions.map(d => d.id === candidate.id
    ? { ...d, status: 'confirmed' as const, reason: 'The basket button transitions every property; narrow the motion to its colour.' } : d) };
  publishSlopReview(root, triage, writer);
  assert.throws(() => checkSlopReview(root), /confirmed issues remain/);
  await assert.rejects(captureSlopCheckpoint(root, { ...scope, views: scope.views.slice(0, 1) }, writer), /narrow\/change scope/);
  writeFileSync(join(root, 'index.html'), html('color'));
  assert.throws(() => checkSlopReview(root), /source or scanner/);
  const second = await captureSlopCheckpoint(root, scope, writer);
  const after = dismiss(second);
  assert.throws(() => publishSlopReview(root, { ...after, resolved: [] }, writer), /previously confirmed/);
  after.resolved = after.resolved.map(r => ({ ...r, reason: 'After the property change, both viewport captures keep the same basket action and the source rescan no longer finds all-property-transition.', viewIds: ['desktop', 'mobile'] }));
  publishSlopReview(root, after, writer);
  assert.equal(checkSlopReview(root).rounds, 2);
  writeFileSync(join(root, 'index.html'), html('all'));
  assert.throws(() => checkSlopReview(root), /source or scanner/);
});

test('a no-change rescan cannot erase a confirmed problem by changing its judgment', async t => {
  const { root, writer } = fixture(t);
  writeFileSync(join(root, 'index.html'), html('all'));
  const first = await captureSlopCheckpoint(root, scope, writer);
  const triage = dismiss(first);
  const candidate = first.findings.find(f => f.rule === 'all-property-transition')!;
  triage.decisions = triage.decisions.map(d => d.id === candidate.id ? { ...d, status: 'confirmed' as never } : d);
  publishSlopReview(root, triage, writer);
  const next = await captureSlopCheckpoint(root, scope, writer);
  const after = dismiss(next);
  after.resolved = after.resolved.map(r => ({ ...r, reason: 'Caller claims resolved without a revision', viewIds: ['desktop'] }));
  publishSlopReview(root, after, writer);
  assert.throws(() => checkSlopReview(root), /lack a source\/build revision/);
  const record = JSON.parse(readFileSync(join(root, next.checkpoint.path), 'utf8'));
  record.findings = record.findings.filter((finding: { kind: string }) => finding.kind !== 'source-candidate');
  const bytes = JSON.stringify(record), digest = createHash('sha256').update(bytes).digest('hex');
  const path = `.omd/slop/checkpoints/${digest}.json`;
  writeFileSync(join(root, path), bytes);
  const pointerPath = join(root, '.omd/slop/latest.json');
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  pointer.checkpoint = { path, sha256: digest };
  writeFileSync(pointerPath, JSON.stringify(pointer));
  assert.throws(() => checkSlopReview(root), /native checkpoint signature invalid/, 'rehashing a hand-edited checkpoint cannot erase actual source findings');
});

test('scope cannot point at external sites, unrelated localhost ports or escaped files', () => {
  for (const page of ['https://example.org/', 'http://localhost:5173', '../other.html', '/tmp/index.html', '.omd/../index.html']) {
    assert.throws(() => parseSlopScope({ ...scope, views: [{ ...scope.views[0], page }] }), /contained local HTML/);
  }
  assert.doesNotThrow(() => parseSlopScope(scope));
});
