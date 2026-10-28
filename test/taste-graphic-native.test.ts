import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { runTasteGraphic, tasteGraphicNext } from '../core/design/taste-graphic.ts';
import { TASTE_GRAPHIC_REVIEW_TASK } from '../core/design/taste-comparison-contract.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function png(width: number, height: number, seed: number): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(seed);
  return PNG.sync.write(image);
}

function project(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-taste-graphic-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath, cliSha256: hash(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'taste-graphic-parent',
  } });
  const put = (path: string, bytes: Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); return path; };
  const rendered = (path: string, bytes: Buffer, largestRaster: { src: string; share: number } | null = null) => {
    put(path, bytes);
    put(`.omd/graphics/renders/${hash(bytes)}.json`, Buffer.from(JSON.stringify({ schema: 'graphic-render-v1', path, sha256: hash(bytes), largestRaster })));
    return path;
  };
  const graphic = rendered('public/graphics/hero.png', png(64, 40, 90));
  const kept = png(48, 48, 200);
  const anchor = put(`.omd/discovery/browse/session/assets/${hash(kept)}.png`, kept);
  put('.omd/discovery/browse/session/seals/seal.json', Buffer.from(JSON.stringify({ keeps: [{ image: { path: anchor, sha256: hash(kept) } }] })));
  return { root, invocation, put, rendered, graphic, anchor };
}

function useEnv(t: test.TestContext, values: Readonly<Record<string, string>>): void {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('a rendered graphic is judged blind beside a kept gallery graphic, in both orders, and recorded', { timeout: 240_000 }, async t => {
  const { root, invocation, graphic, anchor } = project(t);
  const evidencePath = join(root, 'evidence-text.jsonl');
  writeFileSync(evidencePath, '');
  useEnv(t, { PI_REVIEWER_FIXTURE_MODE: 'taste-picks-a', PI_REVIEWER_FIXTURE_EVIDENCE_TEXT: evidencePath });
  const result = await runTasteGraphic(root, invocation, { graphic, against: [anchor], signal: t.signal });
  assert.equal(result.summary.trials, 2);
  for (const trial of result.trials) assert.equal(trial.projectJudgedAi, trial.order === 'anchor-first');
  // The fixture judge names A human in both orders, which shows nothing about the graphic, so it does not pass.
  assert.equal(result.summary.verdict, 'distinguishable');
  assert.equal(result.round, 1);
  const record = JSON.parse(readFileSync(join(root, result.path), 'utf8'));
  assert.equal(record.schema, 'omd-taste-graphic-review-v1');
  assert.deepEqual(record.graphic, { path: graphic, sha256: hash(readFileSync(join(root, graphic))) });
  // The reviewer sees two fitted canvases and the graphic task; no path or role says which is the build.
  const seen = readFileSync(evidencePath, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { task: string; text: string[] });
  assert.equal(seen.length, 2);
  for (const { task, text } of seen) {
    assert.equal(task, TASTE_GRAPHIC_REVIEW_TASK);
    for (const shown of text) assert.doesNotMatch(shown, /project|anchor|discovery|public\/graphics|\.omd|hero/i);
  }
  // Comparing the unchanged graphic again is not a rework, so it stays round 1 and says so.
  const again = await runTasteGraphic(root, invocation, { graphic, against: [anchor], signal: t.signal });
  assert.equal(again.round, 1);
  assert.match(again.next, /barely differs from the last compared one/);
  assert.equal(readdirSync(join(root, '.omd/taste/graphics')).length, 2);
});

test('only a captured, unchanged reference image stands for human work, and refusals write nothing', async t => {
  const { root, invocation, put, rendered, graphic, anchor } = project(t);
  const drawn = put('public/graphics/other.png', png(32, 32, 10));
  const screenshot = rendered('public/graphics/framed.png', png(40, 40, 60), { src: 'bakery-output.png', share: 0.82 });
  const renamed = put('.omd/discovery/browse/session/assets/kept.png', png(32, 32, 20));
  const record = put('.omd/first-render/captures/x.png', png(16, 16, 30));
  for (const [options, message] of [
    [{ graphic, against: [] }, /--against <image.path>/],
    [{ graphic, against: [drawn] }, /not a reference capture/],
    [{ graphic, against: [renamed] }, /changed after capture/],
    [{ graphic: record, against: [anchor] }, /not a design record/],
    [{ graphic: anchor, against: [anchor] }, /not a design record/],
    [{ graphic: drawn, against: [anchor] }, /not rendered by omd render --graphic/],
    [{ graphic: screenshot, against: [anchor] }, /bakery-output\.png covers 82%.*not a graphic/],
  ] as const) {
    await assert.rejects(() => runTasteGraphic(root, invocation, options), message);
  }
  assert.equal(existsSync(join(root, '.omd/taste')), false);
});

test('the next step names the graphic, the round and the stop', () => {
  assert.match(tasteGraphicNext('distinguishable', 1, 'public/graphics/hero.png'), /Round 1 of 3[\s\S]*public\/graphics\/hero\.png[\s\S]*omd taste graphic/);
  // A rework that keeps the panel-and-caption composition only polishes the cause.
  assert.match(tasteGraphicNext('distinguishable', 2, 'a.png'), /composition itself[\s\S]*rebuild a\.png around a different single protagonist/);
  // With an idea image on record, the rework starts from what the build lost against it; without one, it is not mentioned.
  assert.match(tasteGraphicNext('distinguishable', 1, 'a.png', ['.omd/ideas/review-1.png']), /Open your idea image \(\.omd\/ideas\/review-1\.png\) beside the render[\s\S]*soft contact shadow/);
  assert.doesNotMatch(tasteGraphicNext('distinguishable', 1, 'a.png'), /idea image/);
  assert.doesNotMatch(tasteGraphicNext('distinguishable', 3, 'a.png', ['.omd/ideas/review-1.png']), /idea image/);
  assert.match(tasteGraphicNext('distinguishable', 3, 'a.png'), /Stop reworking/);
  assert.match(tasteGraphicNext('not-distinguishable', 1, 'a.png'), /keep a\.png/);
});

test('a graphic skip is refused until the blind page comparison already passes the page', async t => {
  const { root, invocation } = project(t);
  const { recordGraphicSkip, graphicDecision } = await import('../core/design/taste-graphic-decision.ts');
  const reason = 'The real product capture already shows the mechanism the copy claims.';
  await assert.rejects(recordGraphicSkip(root, invocation, reason, async () => undefined), /run omd taste compare/);
  const judged = (verdict: string) => async () => ({ summary: { verdict, judgedAi: verdict === 'distinguishable' ? 6 : 2, trials: 8 } });
  await assert.rejects(recordGraphicSkip(root, invocation, reason, judged('distinguishable')), /\(6\/8\).*omd taste graphic/);
  assert.equal(graphicDecision(root, invocation.current.briefSha256), null);
  await recordGraphicSkip(root, invocation, reason, judged('not-distinguishable'));
  assert.equal(graphicDecision(root, invocation.current.briefSha256), 'skipped');
});

test('a judge that names the same slot human in both orders is reading position: that pair cannot pass a graphic', async () => {
  const { summarizeTasteGraphicTrials } = await import('../core/design/taste-graphic.ts');
  const trial = (anchorSha256: string, order: 'project-first' | 'anchor-first', projectJudgedAi: boolean) =>
    ({ anchorSha256, order, projectJudgedAi, aiTells: projectJudgedAi ? ['flat fills'] : [] });
  // "A is human" twice: project-first reads as human, anchor-first as AI. No signal, so not a pass.
  assert.equal(summarizeTasteGraphicTrials([trial('a', 'project-first', false), trial('a', 'anchor-first', true)]).verdict, 'distinguishable');
  // Judged human in both orders: the judge really could not tell, which is a pass.
  assert.equal(summarizeTasteGraphicTrials([trial('a', 'project-first', false), trial('a', 'anchor-first', false)]).verdict, 'not-distinguishable');
  // A biased pair beside a consistent one: only the consistent pair counts.
  assert.equal(summarizeTasteGraphicTrials([trial('a', 'project-first', false), trial('a', 'anchor-first', true),
    trial('b', 'project-first', true), trial('b', 'anchor-first', true)]).verdict, 'distinguishable');
});

test('a comparison counts as a new round only when the graphic visibly changed since the last counted one', async () => {
  const { countedRounds, graphicThumb, thumbChange, MATERIAL_CHANGE } = await import('../core/design/taste-graphic-decision.ts');
  const { PNG } = await import('pngjs');
  const render = (paint: (x: number, y: number) => number) => {
    const png = new PNG({ width: 64, height: 64 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4, v = paint(x, y);
      png.data[i] = png.data[i + 1] = png.data[i + 2] = v; png.data[i + 3] = 255;
    }
    return graphicThumb(PNG.sync.write(png));
  };
  const square = render((x, y) => x > 16 && x < 48 && y > 16 && y < 48 ? 60 : 240);
  const nudged = render((x, y) => x > 16 && x < 48 && y > 16 && y < 48 ? 64 : 240);
  const moved = render((x, y) => x > 4 && x < 30 && y > 30 && y < 60 ? 60 : 240);
  assert.ok(thumbChange(square, nudged) < MATERIAL_CHANGE, 'a colour nudge is not a rework');
  assert.ok(thumbChange(square, moved) >= MATERIAL_CHANGE, 'a recomposed object is');
  const at = (minute: number, thumb: number[]) => ({ createdAt: `2026-10-23T21:${String(minute).padStart(2, '0')}:00.000Z`, thumb });
  assert.equal(countedRounds([at(1, square), at(2, nudged), at(3, nudged)]), 1);
  assert.equal(countedRounds([at(1, square), at(2, moved), at(3, square)]), 3);
  assert.equal(countedRounds([{ createdAt: 'a' }, { createdAt: 'b' }]), 2, 'older records without a thumbnail count as before');
});
