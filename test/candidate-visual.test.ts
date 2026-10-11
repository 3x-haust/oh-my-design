import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { resolveCandidateSelection, validateCandidateSelectionPointer } from '../core/brief/candidate-selection.ts';
import { captureCandidateSelection } from '../core/brief/candidate-visual.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { candidateCaptureStates, candidateStateHtml } from './helpers/candidate-states.ts';
import { readCandidateSourceHistory } from '../core/brief/candidate-source-history.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

test('selected visual handoff binds both viewport captures and refuses source or pixel drift', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-candidate-visual-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = '.omd/.cache/sketches/chosen';
  mkdirSync(join(root, directory), { recursive: true });
  const html = '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><main><h1>Upcoming appointments</h1><button>Schedule appointment</button></main><script>history.replaceState({}, "", "/appointments")</script></body></html>';
  writeFileSync(join(root, directory, 'index.html'), html);
  writeFileSync(join(root, directory, 'style.css'), 'body { background: white; color: black; }');
  for (const name of ['noun-swap-test.json', 'selection.json', 'ux-models.json']) {
    writeFileSync(join(root, directory, name), '{}');
  }
  writeFileSync(join(root, '.omd/composition.md'), 'Current composition');
  const input = validateCandidateSelectionPointer({
    schema: 'candidate-selection-pointer-v1', directory: 'chosen',
    indexSha256: hash(html), selectionSha256: hash('{}'),
  });
  const pointer = await captureCandidateSelection(root, input, createTestProjectWriteAdapter(root));
  assert.equal(pointer.schema, 'candidate-selection-pointer-v2');
  assert.deepEqual(pointer.visual.renders.map(row => row.viewport), [
    { width: 1280, height: 900 }, { width: 390, height: 844 },
  ]);
  assert.deepEqual(validateCandidateSelectionPointer(pointer), pointer);
  assert.ok(pointer.visual.sourceHistory);
  const history = readCandidateSourceHistory(root, pointer.visual.sourceHistory);
  assert.equal(history.record.treeSha256, pointer.visual.treeSha256);
  assert.equal(history.files.get('index.html')?.toString('utf8'), html);
  writeFileSync(join(root, '.omd/composition.md'), 'Changed composition');
  assert.doesNotThrow(() => resolveCandidateSelection(root, pointer));
  assert.equal(readCandidateSourceHistory(root, pointer.visual.sourceHistory).record.inputDigests[0]?.sha256,
    hash('Current composition'));
  writeFileSync(join(root, '.omd/composition.md'), 'Current composition');
  assert.deepEqual(pointer.visual.renders.map(row => row.route), ['/appointments', '/appointments']);
  const legacy = { ...pointer, visual: { ...pointer.visual,
    renders: pointer.visual.renders.map(({ route: _route, ...row }) => row) } };
  assert.deepEqual(validateCandidateSelectionPointer(legacy), legacy);
  const paths = resolveCandidateSelection(root, pointer);
  for (const capture of pointer.visual.renders) assert.ok(paths.includes(capture.path));
  const mobile = pointer.visual.renders[1];
  assert.ok(mobile);
  const pixels = readFileSync(join(root, mobile.path));
  writeFileSync(join(root, mobile.path), 'not the reviewed pixels');
  assert.throws(() => resolveCandidateSelection(root, pointer), /CANDIDATE_VISUAL/);
  writeFileSync(join(root, mobile.path), pixels);
  writeFileSync(join(root, directory, 'style.css'), 'body { background: black; color: white; }');
  assert.throws(() => resolveCandidateSelection(root, pointer), /CANDIDATE_VISUAL/);
});

test('declared local states capture complete desktop/mobile pairs and deliver every current image', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-candidate-states-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = '.omd/.cache/sketches/books';
  mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, directory, 'index.html'), candidateStateHtml);
  for (const name of ['noun-swap-test.json', 'selection.json', 'ux-models.json']) writeFileSync(join(root, directory, name), '{}');
  const input = validateCandidateSelectionPointer({
    schema: 'candidate-selection-pointer-v1', directory: 'books',
    indexSha256: hash(candidateStateHtml), selectionSha256: hash('{}'), captureStates: candidateCaptureStates,
  });
  const selected = await captureCandidateSelection(root, input, createTestProjectWriteAdapter(root));
  assert.equal(selected.visual.renders.length, 6);
  assert.deepEqual(selected.captureStates, candidateCaptureStates);
  assert.deepEqual(validateCandidateSelectionPointer(selected), selected);
  const paths = resolveCandidateSelection(root, selected);
  for (const render of selected.visual.renders) assert.ok(paths.includes(render.path));
  for (const index of [0, 1]) {
    assert.equal(selected.visual.renders[index]?.sha256, selected.visual.renders[index + 2]?.sha256);
    assert.notEqual(selected.visual.renders[index + 2]?.sha256, selected.visual.renders[index + 4]?.sha256);
  }
  assert.deepEqual(selected.visual.renders.slice(2).map(row => [row.state, row.route]), [
    ['collapsed-list', '/books'], ['collapsed-list', '/books'],
    ['expanded-editor', '/books#edit'], ['expanded-editor', '/books#edit'],
  ]);
  assert.throws(() => validateCandidateSelectionPointer({
    ...selected, captureStates: candidateCaptureStates.map(state => ({ ...state, route: '/wrong' })),
  }), /CANDIDATE_VISUAL/);
  assert.throws(() => validateCandidateSelectionPointer({
    ...selected, visual: { ...selected.visual, renders: selected.visual.renders.slice(0, -1) },
  }), /CANDIDATE_VISUAL/);
  const expanded = selected.visual.renders[4]!;
  const bytes = readFileSync(join(root, expanded.path));
  writeFileSync(join(root, expanded.path), 'stale complementary state image');
  assert.throws(() => resolveCandidateSelection(root, selected), /CANDIDATE_VISUAL/);
  writeFileSync(join(root, expanded.path), bytes);
  writeFileSync(join(root, directory, 'unrequested.css'), 'body { color: red }');
  assert.throws(() => resolveCandidateSelection(root, selected), /CANDIDATE_VISUAL/);
  assert.equal(existsSync(join(root, '.omd/.cache/sketches/current.json')), false);
});

test('candidate state input refuses unbounded, ambiguous and external plans before publication', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-candidate-state-refusal-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = '.omd/.cache/sketches/books';
  mkdirSync(join(root, directory), { recursive: true });
  let externalRequests = 0;
  const external = createServer((_request, response) => {
    externalRequests++;
    response.writeHead(200, { 'content-type': 'text/html' }).end(candidateStateHtml);
  });
  t.after(() => new Promise<void>(resolve => {
    external.closeAllConnections();
    external.close(() => resolve());
  }));
  await new Promise<void>((resolve, reject) => {
    external.once('error', reject);
    external.listen(0, '127.0.0.1', () => { external.removeListener('error', reject); resolve(); });
  });
  const address = external.address();
  assert.ok(address && typeof address !== 'string');
  const html = candidateStateHtml.replace('</main>', `<a id="external" href="http://127.0.0.1:${address.port}/books">External</a></main>`);
  writeFileSync(join(root, directory, 'index.html'), html);
  for (const name of ['noun-swap-test.json', 'selection.json', 'ux-models.json']) writeFileSync(join(root, directory, name), '{}');
  const base = { schema: 'candidate-selection-pointer-v1', directory: 'books',
    indexSha256: hash(html), selectionSha256: hash('{}') };
  const state = candidateCaptureStates[1]!;
  for (const captureStates of [
    [{ ...state, actions: [{ kind: 'evaluate', selector: '#edit', value: 'alert(1)' }] }],
    [{ ...state, actions: [{ kind: 'press', selector: '#edit', value: 'Control+L' }] }],
    [{ ...state, route: 'https://example.invalid/' }], [state, state],
    [{ ...state, name: 'initial' }], Array.from({ length: 13 }, (_, i) => ({ ...state, name: `s${i}` })),
  ]) assert.throws(() => validateCandidateSelectionPointer({ ...base, captureStates }));
  for (const rejectedState of [
    { ...state, actions: [{ kind: 'click', selector: 'article' }] },
    { ...candidateCaptureStates[0]!, actions: [{ kind: 'click', selector: '#external' }] },
    { ...state, actions: [] },
  ]) {
    const input = validateCandidateSelectionPointer({ ...base, captureStates: [rejectedState] });
    await assert.rejects(() => captureCandidateSelection(root, input, createTestProjectWriteAdapter(root)));
    assert.equal(existsSync(join(root, '.omd/.cache/sketches/current.json')), false);
    assert.equal(existsSync(join(root, '.omd/.cache/candidate-renders')), false);
  }
  assert.equal(externalRequests, 0, 'another origin must receive no navigation, even when it serves the matching state');
});
