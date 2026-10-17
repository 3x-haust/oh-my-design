import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lexicon, lexiconSha256, parseInput, publishTranslation, readTranslation, projection, requireCopyToneReview } from '../core/design-language/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { publishModelLedRoute } from './helpers/model-led.ts';
import { checkMovement, requireMovement, type Measurement } from '../core/design-language/check.ts';
import { marketDesignQueries } from '../core/ref/market-reference.ts';
import { moodQueries } from '../core/ref/mood-query.ts';
const SHA = 'a'.repeat(64);
const reading = { id: 'space', labelKo: '간격 넓히기', origin: { kind: 'lexicon', entryId: 'cramped', readingId: 'space', revision: lexicon.revision, sha256: lexiconSha256 }, targets: [{ id: 'group', metric: 'group-gap', role: 'form', route: '/', selector: 'form', viewport: 'desktop', state: 'initial', range: [16, 24], unit: 'px', direction: 'increase', minDelta: 4 }], referenceKeywordsEn: ['grouped settings rows'], counterSignals: ['touching'], mustNotMean: ['delete information'] };
const input = { schema: 'design-language-input-v1', kind: 'intake', text: '답답해', request: '답답해', sourceContractSha256: SHA, readings: [reading], chosenId: 'space', decision: 'form rows collide' };
test('curated lexicon grounds Korean/English phrases in measurable readings', () => {
  assert.equal(lexicon.entries.length, 20);
  assert.ok(lexicon.entries.every(e => e.aliases.ko.length && e.aliases.en.length));
  assert.equal(parseInput(input, 'intake', '답답해', SHA).status, 'resolved');
  assert.throws(() => parseInput({ ...input, readings: [{ ...reading, targets: [] }] }, 'intake', '답답해', SHA), /DESIGN_LANGUAGE_UNGROUNDED/);
  assert.throws(() => parseInput({ ...input, readings: [{ ...reading, targets: [{ ...reading.targets[0], metric: 'beauty' }] }] }, 'intake', '답답해', SHA), /DESIGN_LANGUAGE_INVALID/);
  assert.throws(() => parseInput({ ...input, request: 'truncated' }, 'intake', '답답해', SHA), /DESIGN_LANGUAGE_STALE/);
  assert.throws(() => parseInput({ ...input, readings: [reading, { ...reading, id: 'other' }], chosenId: null }, 'intake', '답답해', SHA), /DESIGN_LANGUAGE_AMBIGUOUS/);
  assert.equal(parseInput({ ...input, readings: [{ ...reading, origin: { kind: 'model-proposed' } }] }, 'intake', '답답해', SHA).status, 'resolved');
  assert.equal(parseInput({ ...input, readings: [{ ...reading, origin: { kind: 'model-proposed' }, referenceKeywordsEn: ['clean'] }] }, 'intake', '답답해', SHA).status, 'resolved');
  assert.equal(parseInput({ ...input, text: 'I need breathing room', readings: [reading] }, 'intake', '답답해', SHA).status, 'resolved');
});
test('Korean welfare query preserves supplied English mechanism without contaminating domain queries', () => {
  assert.ok(marketDesignQueries('KR', 'ko', '복지 혜택', 'app interface', false, ['grouped settings rows']).every(q => q.includes('grouped settings rows')));
});
test('translation participates before the in-category query cap', () => {
  const brief = { domain: 'benefits', surfaces: [{ name: 'dashboard' }], coreObjects: [], referenceQueries: { mood: ['first', 'second', 'third'], component: [], craft: [] } } as unknown as Parameters<typeof moodQueries>[0];
  const queries = moodQueries(brief, 'in-category', 1, ['grouped settings rows']);
  assert.equal(queries.length, 3);
  assert.match(queries[0]!.query, /grouped settings rows/);
});
test('movement compares exact scope, direction, range, and preservation', () => {
  const target = parseInput(input, 'intake', '답답해', SHA).readings[0]!.targets[0]!;
  const before: Measurement = { schema: 'design-language-measurement-v1', translationSha256: SHA, buildSha256: SHA, route: '/', state: 'initial', viewport: 'desktop', values: [{ targetId: 'group', value: 8, present: true }], floors: { task: true, accessibility: true, safety: true } };
  const after: Measurement = { ...before, buildSha256: 'b'.repeat(64), values: [{ targetId: 'group', value: 18, present: true }] };
  assert.equal(checkMovement([target], before, after).passed, true);
  assert.equal(checkMovement([target], before, { ...after, values: [{ targetId: 'group', value: 10, present: true }] }).passed, false);
  assert.throws(() => checkMovement([target], before, { ...after, viewport: 'mobile' }), /FEEDBACK_BASELINE_STALE/);
  assert.throws(() => checkMovement([target], before, { ...after, floors: { ...after.floors, task: false } }), /FEEDBACK_TARGET_UNMET/);
  assert.throws(() => checkMovement([target], before, { ...after, values: [{ targetId: 'group', value: 18, present: false }] }), /FEEDBACK_MEASUREMENT_REQUIRED/);
});
test('publication binds current route and refuses stale requests without changing source or pointer', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-language-publication-')));
  try {
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    const invocation = publishModelLedRoute(root, routeInput, String(routeInput.request)).invocation;
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    writeFileSync(join(root, 'index.html'), '<main>unchanged</main>');
    const authored = { ...input, request: route.request, sourceContractSha256: route.sourceContractSha256 };
    const pointer = publishTranslation(root, invocation, writer, 'intake', authored);
    assert.equal(readTranslation(root, 'intake', route)?.sha256, pointer.sha256);
    const original = readFileSync(join(root, '.omd/design-language/intake.json'), 'utf8');
    assert.throws(() => publishTranslation(root, invocation, writer, 'intake', { ...authored, request: 'truncated' }), /DESIGN_LANGUAGE_STALE/);
    assert.throws(() => publishTranslation(root, invocation, writer, 'intake', { ...authored, readings: [{ ...reading, targets: [] }] }), /DESIGN_LANGUAGE_UNGROUNDED/);
    assert.equal(readFileSync(join(root, '.omd/design-language/intake.json'), 'utf8'), original);
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), '<main>unchanged</main>');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('model-led meaning selection refuses a pending interview and accepts an explicit grounded choice', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-language-question-')));
  try {
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    const invocation = publishModelLedRoute(root, routeInput, String(routeInput.request)).invocation;
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    writeFileSync(join(root, 'index.html'), '<main>unchanged</main>');
    const one = { ...reading, id: 'one' };
    const two = { ...reading, id: 'two' };
    const pending = {
      ...input,
      request: route.request,
      sourceContractSha256: route.sourceContractSha256,
      readings: [one, two],
      chosenId: null,
      question: {
        textKo: '어느 쪽이 더 가까울까요?',
        options: [
          { readingId: 'one', thumbnailPath: '.omd/refs/design/one.png', captureSha256: 'a'.repeat(64) },
          { readingId: 'two', thumbnailPath: '.omd/refs/design/two.png', captureSha256: 'b'.repeat(64) },
        ],
        answerId: null,
      },
    };
    const before = readFileSync(join(root, 'index.html'), 'utf8');
    assert.throws(
      () => publishTranslation(root, invocation, writer, 'intake', pending),
      /DESIGN_LANGUAGE_AUTONOMOUS_SELECTION_REQUIRED/,
    );
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), before);
    assert.equal(readTranslation(root, 'intake', route), null);
    const resolved = publishTranslation(root, invocation, writer, 'intake', {
      ...pending,
      chosenId: 'one',
      question: undefined,
      decision: 'The first grounded reading best matches the current form hierarchy.',
    });
    assert.equal(readTranslation(root, 'intake', route)?.translation.chosenId, 'one');
    assert.equal(readTranslation(root, 'intake', route)?.translation.answerTo, null);
    assert.match(resolved.sha256, /^[a-f0-9]{64}$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CLI language translation refuses an unbound legacy structured route without writing a pointer', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-language-cli-')));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    writeFileSync(join(root, '.omd/.cache/route.json'), JSON.stringify(routeInput));
    const classified = run('route', 'classify', '--input', '.omd/.cache/route.json', '--json');
    assert.equal(classified.status, 0, classified.stderr);
    const shown = run('route', 'show', '--json');
    assert.notEqual(shown.status, 0);
    assert.match(shown.stderr, /MALFORMED_ADAPTIVE_ROUTE/);
    assert.equal(existsSync(join(root, '.omd/design-language/intake.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('copy-tone remains source-free while model-led routes refuse legacy Writer-stage review', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-language-copy-')));
  try {
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    const invocation = publishModelLedRoute(root, routeInput, String(routeInput.request)).invocation;
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    const original = Buffer.from('## Surface copy\nA terse original sentence.\n');
    writeFileSync(join(root, '.omd/copy-deck.md'), original);
    const tone = { ...reading, id: 'tone', labelKo: '문구 친근하게', origin: { kind: 'lexicon', entryId: 'warm', readingId: 'copy-tone', revision: lexicon.revision, sha256: lexiconSha256 },
      targets: [{ ...reading.targets[0], id: 'copy-text', role: 'copy-tone', metric: 'body-line-height', unit: 'ratio', range: [1.45, 1.7] }], referenceKeywordsEn: ['readable guidance text'] };
    const authored = { ...input, text: '따뜻하게', request: route.request, sourceContractSha256: route.sourceContractSha256, readings: [tone], chosenId: 'tone' };
    const pointer = publishTranslation(root, invocation, writer, 'intake', authored);
    assert.deepEqual(projection(root, route)?.targets, []);
    assert.throws(() => requireCopyToneReview(root, route), /DESIGN_LANGUAGE_REQUIRED/);
    const revised = Buffer.from('## Surface copy\nA warmer, more helpful sentence.\n');
    writeFileSync(join(root, '.omd/copy-deck.md'), revised);
    assert.throws(() => requireCopyToneReview(root, route), /DESIGN_LANGUAGE_REQUIRED/);
    assert.equal(readTranslation(root, 'intake', route)?.sha256, pointer.sha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('feedback CLI refuses a legacy structured route before copy-tone mutation', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-language-copy-cli-')));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    writeFileSync(join(root, '.omd/.cache/route.json'), readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json')));
    const classified = run('route', 'classify', '--input', '.omd/.cache/route.json', '--json');
    assert.equal(classified.status, 0, classified.stderr);
    const shown = run('route', 'show', '--json');
    assert.notEqual(shown.status, 0);
    assert.match(shown.stderr, /MALFORMED_ADAPTIVE_ROUTE/);
    assert.equal(existsSync(join(root, '.omd/design-language/feedback.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('missing feedback movement cannot mutate an application or current pointer', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-language-')));
  try {
    mkdirSync(join(root, '.omd/design-language/records'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<main>unchanged</main>');
    const record = parseInput({ ...input, kind: 'feedback' }, 'feedback', '답답해', SHA);
    const bytes = `${canonicalJson(record)}\n`;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = `.omd/design-language/records/sha256-${hash}.json`;
    writeFileSync(join(root, path), bytes);
    const pointer = JSON.stringify({ schema: 'design-language-pointer-v1', record: path, sha256: hash });
    writeFileSync(join(root, '.omd/design-language/feedback.json'), pointer);
    assert.equal(readTranslation(root, 'feedback')?.sha256, hash);
    assert.doesNotThrow(() => requireMovement(root));
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), '<main>unchanged</main>');
    assert.equal(readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8'), pointer);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { createHash } from 'node:crypto';
import { readPersistedRoute } from '../core/route/index.ts';

