import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexicon, lexiconSha256 } from '../core/design-language/index.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const cli = join(repo, 'bin/omd.mjs');
const scratch = join(repo, '.omo/ref-fix');
const entry = 'index.html';
const html = (gap: number): string => `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Local feedback fixture</title><style>form{display:flex;flex-direction:column;gap:${gap}px;padding:20px}button{min-height:44px}</style><main><h1>신청</h1><form><label>이름<input required name="name"></label><button type="submit">확인</button></form></main></html>`;

test('real native feedback CLI measures cramped form before and after CSS repair; refuses no movement', () => {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'feedback-rendered-'));
  const log: string[] = [];
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 90000 });
    log.push(`$ omd ${args.join(' ')}\nexit=${result.status}\nstdout=${result.stdout.trim()}\nstderr=${result.stderr.trim()}`);
    return result;
  };
  try {
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    writeFileSync(join(root, entry), html(8));
    writeFileSync(join(root, '.omd/.cache/route.json'), readFileSync(join(repo, 'test/fixtures/adaptive-flow/synth-marketing.json')));
    const classified = run('route', 'classify', '--input', '.omd/.cache/route.json', '--json');
    assert.equal(classified.status, 0, classified.stderr);
    const shown = run('route', 'show', '--json');
    assert.equal(shown.status, 0, shown.stderr);
    const route = JSON.parse(shown.stdout) as { request: string; sourceContractSha256: string };
    const authored = {
      schema: 'design-language-input-v1', kind: 'feedback', text: '답답해', request: route.request, sourceContractSha256: route.sourceContractSha256,
      readings: [{ id: 'space', labelKo: '폼 간격 넓히기',
        origin: { kind: 'lexicon', entryId: 'cramped', readingId: 'space', revision: lexicon.revision, sha256: lexiconSha256 },
        targets: [{ id: 'form-gap', metric: 'group-gap', role: 'form', route: '/', selector: 'form', state: 'initial', viewport: 'desktop', range: [16, 24], unit: 'px', direction: 'increase', minDelta: 4 }],
        referenceKeywordsEn: ['grouped settings rows'], counterSignals: ['fields touching'], mustNotMean: ['delete required fields'] }],
      chosenId: 'space', decision: 'Current form rows have an 8px gap, below the scoped reading range.',
    };
    writeFileSync(join(root, '.omd/.cache/feedback.json'), JSON.stringify(authored));
    const translated = run('feedback', 'translate', '--input', '.omd/.cache/feedback.json', '--page', entry, '--json');
    assert.equal(translated.status, 0, translated.stderr);
    const baseline = JSON.parse(readFileSync(join(root, '.omd/design-language/baseline.json'), 'utf8')) as { values: { value: number }[] };
    assert.equal(baseline.values[0]?.value, 8);
    const pointer = readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8');
    writeFileSync(join(root, entry), html(8).replace('padding:20px', 'padding:22px'));
    const noMovementSource = readFileSync(join(root, entry), 'utf8');
    const refused = run('feedback', 'check', '--page', entry, '--json');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /FEEDBACK_TARGET_UNMET/);
    assert.equal(existsSync(join(root, '.omd/design-language/check.json')), false);
    assert.equal(readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8'), pointer);
    assert.equal(readFileSync(join(root, entry), 'utf8'), noMovementSource);
    writeFileSync(join(root, entry), html(18));
    const passed = run('feedback', 'check', '--page', entry, '--json');
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(JSON.parse(passed.stdout).ok, true);
    assert.equal(readFileSync(join(root, '.omd/design-language/feedback.json'), 'utf8'), pointer);
    const checkPointer = JSON.parse(readFileSync(join(root, '.omd/design-language/check.json'), 'utf8')) as { record: string };
    const check = JSON.parse(readFileSync(join(root, checkPointer.record), 'utf8')) as { passed: boolean; targets: { before: number; after: number; passed: boolean }[] };
    assert.equal(check.passed, true);
    assert.deepEqual(check.targets.map(t => [t.before, t.after, t.passed]), [[8, 18, true]]);
    log.push(`result=movement 8px -> 18px; record=${checkPointer.record}; applicationSha256=${createHash('sha256').update(readFileSync(join(root, entry))).digest('hex')}`);
  } finally {
    writeFileSync(join(scratch, 'feedback-cli-session.log'), `${log.join('\n\n')}\n`);
    rmSync(root, { recursive: true, force: true });
  }
});
