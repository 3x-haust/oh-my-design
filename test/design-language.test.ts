import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lexicon, lexiconSha256, parseInput, publishTranslation, readTranslation, projection, requireCopyToneReview } from '../core/design-language/index.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { checkMovement, requireMovement, type Measurement } from '../core/design-language/check.ts';
import { marketDesignQueries } from '../core/ref/market-reference.ts';
import { refRecordPath } from '../core/ref/store.ts';
import type { Reference } from '../core/types.ts';
import { moodQueries } from '../core/ref/mood-query.ts';
import { validateCurrentCompositionContractSource } from '../core/composition-contract/index.ts';
import { publishReadingJudgment } from './design-language-judgment-cli.ts';
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
test('translation participates before the in-category query cap; composition requires exact fingerprint and rows', () => {
  const brief = { domain: 'benefits', surfaces: [{ name: 'dashboard' }], coreObjects: [], referenceQueries: { mood: ['first', 'second', 'third'], component: [], craft: [] } } as unknown as Parameters<typeof moodQueries>[0];
  const queries = moodQueries(brief, 'in-category', 1, ['grouped settings rows']);
  assert.equal(queries.length, 3);
  assert.match(queries[0]!.query, /grouped settings rows/);
  const contract = '## Input fingerprint\n- Frame SHA-256: ' + SHA + '\n- Copy deck SHA-256: ' + SHA + '\n- Type proof SHA-256: ' + SHA + '\n- Scout SHA-256: N/A — no scout\n- Design language SHA-256: ' + SHA + '\n\n## Design language targets\n- group | / | form | group-gap | 16..24\n';
  const inputs = { contract, frame: SHA, copyDeck: SHA, typeProof: SHA, designLanguage: SHA, languageTargets: [{ id: 'group', route: '/', selector: 'form', metric: 'group-gap', range: [16, 24] as const }] };
  assert.ok(!validateCurrentCompositionContractSource(inputs).some(f => /DESIGN_LANGUAGE_BINDING_MISSING/.test(f.message)));
  assert.ok(validateCurrentCompositionContractSource({ ...inputs, contract: contract.replace('16..24', '16..23') }).some(f => /DESIGN_LANGUAGE_BINDING_MISSING/.test(f.message)));
  assert.ok(validateCurrentCompositionContractSource({ ...inputs, contract: contract.replace(`- Design language SHA-256: ${SHA}\n`, '') }).some(f => /DESIGN_LANGUAGE_BINDING_MISSING/.test(f.message)));
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
  const root = mkdtempSync(join(tmpdir(), 'omd-language-publication-'));
  try {
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    const invocation = publishTestAdaptiveRoute(root, routeInput);
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
test('picture-backed meaning question accepts only its current bound answer', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-question-'));
  try {
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    const invocation = publishTestAdaptiveRoute(root, routeInput);
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<main>unchanged</main>');
    const pngs = ['1280x900.png', '390x844.png'].map(file => readFileSync(join(import.meta.dirname,
      'fixtures/trusted-lifecycle-project/.omd/evaluation-runs/sha256-7ed1e6c5732c6c42e5be64be04ced2d264d25c1c3220582e16f1f636c24906de', file)));
    const options = ['one', 'two'].map((id, index) => {
      const thumbnailPath = `.omd/refs/design/${id}.png`;
      const bytes = pngs[index]!;
      writeFileSync(join(root, thumbnailPath), bytes);
      const captureSha256 = createHash('sha256').update(bytes).digest('hex');
      const source = `https://example.com/${id}`;
      const ref: Reference = { source, component: id, researchLane: 'design', kind: 'image', capturedAt: '2026-09-28T00:00:00.000Z',
        origin: 'user', imagePath: thumbnailPath, invariants: null, principles: [],
        acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: captureSha256 } };
      writeFileSync(refRecordPath(root, ref), JSON.stringify(ref));
      return { readingId: id, thumbnailPath, captureSha256 }; 
    });
    const one = { ...reading, id: 'one' };
    const two = { ...reading, id: 'two' };
    const pending = { ...input, request: route.request, sourceContractSha256: route.sourceContractSha256, readings: [one, two], chosenId: null, question: { textKo: '어느 쪽이 더 가까울까요?', options, answerId: null } };
    const fake = { ...pending, question: { ...pending.question, options: pending.question.options.map((option, index) =>
      index === 0 ? { ...option, thumbnailPath: '.omd/refs/design/unbound.png' } : option) } };
    const before = readFileSync(join(root, 'index.html'), 'utf8');
    assert.throws(() => publishTranslation(root, invocation, writer, 'intake', fake), /DESIGN_LANGUAGE_UNGROUNDED/);
    const refFile = refRecordPath(root, { source: 'https://example.com/one', component: 'one', researchLane: 'design' });
    const signed = readFileSync(refFile, 'utf8');
    writeFileSync(refFile, signed.replace('"httpStatus":200', '"httpStatus":403'));
    assert.throws(() => publishTranslation(root, invocation, writer, 'intake', pending), /DESIGN_LANGUAGE_UNGROUNDED/);
    writeFileSync(refFile, signed);
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), before);
    assert.equal(readTranslation(root, 'intake', route), null);
    const question = publishTranslation(root, invocation, writer, 'intake', pending);
    const pointer = readFileSync(join(root, '.omd/design-language/intake.json'), 'utf8');
    assert.throws(() => publishTranslation(root, invocation, writer, 'intake', { ...pending, chosenId: 'one', question: undefined }), /DESIGN_LANGUAGE_AMBIGUOUS/);
    assert.throws(() => publishTranslation(root, invocation, writer, 'intake', { ...pending, chosenId: 'one', question: undefined, questionDigest: 'b'.repeat(64) }), /DESIGN_LANGUAGE_AMBIGUOUS/);
    assert.equal(readFileSync(join(root, '.omd/design-language/intake.json'), 'utf8'), pointer);
    const resolved = publishTranslation(root, invocation, writer, 'intake', { ...pending, chosenId: 'one', question: undefined, questionDigest: question.sha256 });
    assert.equal(readTranslation(root, 'intake', route)?.translation.answerTo, question.sha256);
    assert.notEqual(resolved.sha256, question.sha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CLI translates a route-bound reading and refuses an invalid update without changing the pointer', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-cli-'));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    writeFileSync(join(root, '.omd/.cache/route.json'), JSON.stringify(routeInput));
    const classified = run('route', 'classify', '--input', '.omd/.cache/route.json', '--json');
    assert.equal(classified.status, 0, classified.stderr);
    const shown = run('route', 'show', '--json');
    assert.equal(shown.status, 0, shown.stderr);
    const route = JSON.parse(shown.stdout) as { request: string; sourceContractSha256: string };
    const authored = { ...input, request: route.request, sourceContractSha256: route.sourceContractSha256 };
    writeFileSync(join(root, '.omd/.cache/language.json'), JSON.stringify(authored));
    const judgment = publishReadingJudgment(root, authored, run);
    const published = run('language', 'translate', '--input', '.omd/.cache/language.json', '--judgment', judgment, '--json');
    assert.equal(published.status, 0, published.stderr);
    const pointer = readFileSync(join(root, '.omd/design-language/intake.json'), 'utf8');
    assert.equal(run('language', 'check', '--json').status, 0);
    writeFileSync(join(root, '.omd/.cache/language.json'), JSON.stringify({ ...authored, request: 'truncated' }));
    const rejected = run('language', 'translate', '--input', '.omd/.cache/language.json', '--json');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /DESIGN_LANGUAGE_STALE/);
    assert.equal(readFileSync(join(root, '.omd/design-language/intake.json'), 'utf8'), pointer);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('copy-tone reopens Writer and requires changed deck with current CLEAN review; Hand sees no targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-copy-'));
  try {
    const routeInput = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json'), 'utf8'));
    const invocation = publishTestAdaptiveRoute(root, routeInput);
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    const original = Buffer.from('## Surface copy\nA terse original sentence.\n');
    writeFileSync(join(root, '.omd/copy-deck.md'), original);
    const review = (bytes: Buffer) => `Mode: copy-editor\nReview time: 2026-09-28T00:00:00Z\nReviewed copy-deck SHA-256: ${copyDeckSha256(bytes)}\nVerdict: CLEAN\nFindings: Reviewed current deck.\n`;
    writeFileSync(join(root, '.omd/.cache/copy-eye.md'), review(original));
    const tone = { ...reading, id: 'tone', labelKo: '문구 친근하게', origin: { kind: 'lexicon', entryId: 'warm', readingId: 'copy-tone', revision: lexicon.revision, sha256: lexiconSha256 },
      targets: [{ ...reading.targets[0], id: 'copy-text', role: 'copy-tone', metric: 'body-line-height', unit: 'ratio', range: [1.45, 1.7] }], referenceKeywordsEn: ['readable guidance text'] };
    const authored = { ...input, text: '따뜻하게', request: route.request, sourceContractSha256: route.sourceContractSha256, readings: [tone], chosenId: 'tone' };
    publishTranslation(root, invocation, writer, 'intake', authored);
    assert.deepEqual(projection(root, route)?.targets, []);
    assert.match(buildBrief(root, 'production', join(import.meta.dirname, '..', 'core'), invocation).blockers.join(' '), /DESIGN_LANGUAGE_STALE/);
    assert.throws(() => requireCopyToneReview(root, route), /DESIGN_LANGUAGE_STALE/);
    const revised = Buffer.from('## Surface copy\nA warmer, more helpful sentence.\n');
    writeFileSync(join(root, '.omd/copy-deck.md'), revised);
    assert.throws(() => requireCopyToneReview(root, route), /DESIGN_LANGUAGE_STALE/);
    writeFileSync(join(root, '.omd/.cache/copy-eye.md'), review(revised));
    assert.doesNotThrow(() => requireCopyToneReview(root, route));
    assert.ok(!buildBrief(root, 'production', join(import.meta.dirname, '..', 'core'), invocation).blockers.some(b => b.includes('DESIGN_LANGUAGE_STALE')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('feedback CLI routes copy-tone to Writer review without requiring a Hand measurement or --page', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-copy-cli-'));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    writeFileSync(join(root, '.omd/.cache/route.json'), readFileSync(join(import.meta.dirname, 'fixtures/adaptive-flow/copy-only.json')));
    assert.equal(run('route', 'classify', '--input', '.omd/.cache/route.json', '--json').status, 0);
    const route = JSON.parse(run('route', 'show', '--json').stdout) as { request: string; sourceContractSha256: string };
    const oldDeck = Buffer.from('Original text');
    writeFileSync(join(root, '.omd/copy-deck.md'), oldDeck);
    const tone = { ...reading, id: 'tone', origin: { kind: 'lexicon', entryId: 'warm', readingId: 'copy-tone', revision: lexicon.revision, sha256: lexiconSha256 },
      targets: [{ ...reading.targets[0], metric: 'body-line-height', unit: 'ratio', role: 'copy-tone', range: [1.45, 1.7] }], referenceKeywordsEn: ['readable guidance text'] };
    const authored = { ...input, kind: 'feedback', text: '따뜻하게', request: route.request, sourceContractSha256: route.sourceContractSha256, readings: [tone], chosenId: 'tone' };
    writeFileSync(join(root, '.omd/.cache/feedback.json'), JSON.stringify(authored));
    const judgment = publishReadingJudgment(root, authored, run);
    const translated = run('feedback', 'translate', '--input', '.omd/.cache/feedback.json', '--judgment', judgment, '--json');
    assert.equal(translated.status, 0, translated.stderr);
    const pointer = readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8');
    const blocked = run('feedback', 'check', '--json');
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /DESIGN_LANGUAGE_STALE/);
    assert.equal(readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8'), pointer);
    const deck = Buffer.from('More welcoming guidance.');
    writeFileSync(join(root, '.omd/copy-deck.md'), deck);
    writeFileSync(join(root, '.omd/.cache/copy-eye.md'), `Mode: copy-editor\nReview time: 2026-09-28T00:00:00Z\nReviewed copy-deck SHA-256: ${copyDeckSha256(deck)}\nVerdict: CLEAN\nFindings: Reviewed current deck.\n`);
    const passed = run('feedback', 'check', '--json');
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(JSON.parse(passed.stdout).ok, true);
    assert.equal(readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8'), pointer);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('missing feedback movement cannot mutate an application or current pointer', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-'));
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
import { copyDeckSha256 } from '../core/copy/index.ts';
import { buildBrief } from '../core/brief/index.ts';

