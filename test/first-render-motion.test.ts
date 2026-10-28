import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import { firstRenderReviewPacket } from '../core/design/first-render-review.ts';
import { captureFirstRenderMotion, firstRenderMotionProjection, scrollSections } from '../core/design/first-render-motion.ts';
import { firstRenderIterationRenders } from '../core/design/first-render-iteration-history.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

test('the early review packet carries the build motion observation and machine-detected template tells', { timeout: 180_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-first-render-motion-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodePath = realpathSync(process.execPath);
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath: nodePath, cliSha256: hash(readFileSync(nodePath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'motion-parent',
  } });
  const writer = createTestProjectWriteAdapter(root, invocation);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), `<!doctype html><html><style>
    body{margin:0;font:18px system-ui}main{min-height:100vh;display:grid;place-content:center;gap:24px}
    h1{font-size:64px;margin:0;opacity:0;transform:translateY(32px);animation:up .7s cubic-bezier(.16,1,.3,1) .1s forwards}
    @keyframes up{to{opacity:1;transform:none}}
    @media (prefers-reduced-motion: reduce){h1{animation:none;opacity:1;transform:none}}
  </style><body><main><h1>Arriving headline</h1><a href="#repo">GitHub ↗</a></main><section style="height:2400px;padding:40px">Below the entry</section></body></html>`);
  publishDesignJudgment(root, {
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A short launch page',
      dominantObject: 'headline', subordinate: ['repository link'], densityIntent: 'one statement',
      trustSource: 'public repository', twoSecondRead: 'What the project is' },
    judgments: [{ id: 'lead', observation: 'The headline leads.', whyItWorksThere: 'It carries the promise.',
      relevance: 'high', adopt: ['Headline first'], reject: ['Source branding'], interpretation: 'Lead with the headline.', scope: 'surface' }],
  }, writer);
  const checked = await publishFirstRenderCheck(root, 'dist/index.html', undefined, writer, invocation);

  const before = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.equal(before.evidence.motion, undefined);
  assert.ok(before.evidence.templateTells.some((tell: { rule: string }) => tell.rule === 'SLOP-TYPED-ARROW-ICON'),
    JSON.stringify(before.evidence.templateTells));

  const observed = await captureFirstRenderMotion(root, join(root, 'dist/index.html'), checked.reportSha256, writer);
  assert.equal(observed.context.timeline.load.lead, 'h1 "Arriving headline"');
  const packet = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.deepEqual(packet.evidence.motion, observed.context);
  assert.equal(packet.evidence.motionRenders[0].role, 'motion-contact-sheet');
  // Below the entry the reviewer reads full-size frames, not only the sheet's thumbnails.
  const sections = packet.evidence.motionRenders.slice(1);
  assert.ok(sections.length >= 2, JSON.stringify(sections.map((row: { scrollY: number }) => row.scrollY)));
  for (const row of sections) assert.deepEqual([row.role, row.width, row.height], ['scroll-section', 1280, 900]);
  assert.notEqual(packet.evidenceSha256, before.evidenceSha256);
  // As the previous iteration, the same build hands the next review its entry pair and then its section frames.
  const previous = firstRenderIterationRenders(root, { id: '1', checkpointSha256: 'b'.repeat(64), reportSha256: checked.reportSha256,
    captures: packet.evidence.renders.map((row: { viewport: 'desktop' | 'mobile'; captureSha256: string }) =>
      ({ viewport: row.viewport, captureSha256: row.captureSha256 })),
    reviewSha256: null, decision: null, progress: null, findingIds: [] }, 'previous-iteration');
  assert.deepEqual(previous.map(row => row.role), ['previous-iteration', 'previous-iteration',
    ...sections.map(() => 'previous-scroll-section')]);
  assert.deepEqual(previous.slice(2).map(row => [row.captureSha256, 'scrollY' in row ? row.scrollY : null]),
    sections.map((row: { captureSha256: string; scrollY: number }) => [row.captureSha256, row.scrollY]));
  // Another report's observation never leaks into this packet.
  assert.equal(firstRenderMotionProjection(root, 'f'.repeat(64)), null);

  const section = join(root, `.omd/first-render/motion/${observed.renders[1]!.captureSha256}.png`);
  const sectionBytes = readFileSync(section);
  writeFileSync(section, Buffer.concat([sectionBytes, Buffer.from('tampered')]));
  assert.throws(() => firstRenderReviewPacket(root, invocation), /scroll section drift/);
  writeFileSync(section, sectionBytes);
  const sheet = join(root, `.omd/first-render/motion/${observed.renders[0]!.captureSha256}.png`);
  writeFileSync(sheet, Buffer.concat([readFileSync(sheet), Buffer.from('tampered')]));
  assert.throws(() => firstRenderReviewPacket(root, invocation), /contact sheet drift/);
  const record = join(root, `.omd/first-render/motion/${checked.reportSha256}.json`);
  const forged = JSON.parse(readFileSync(record, 'utf8'));
  forged.timeline.load.lead = 'p "Invented"';
  writeFileSync(record, JSON.stringify(forged));
  assert.throws(() => firstRenderReviewPacket(root, invocation), /record changed/);
});

test('scroll sections step a screen apart, keep the page bottom and stay bounded', () => {
  const frames = [{ label: 't=0ms', atMs: 0 }, ...[515, 1030, 1546, 2061, 2576, 3091].map(y => ({ label: `scroll ${y}px` }))];
  assert.deepEqual(scrollSections(frames).map(frame => frame.scrollY), [1030, 2061, 3091]);
  assert.deepEqual(scrollSections([{ label: 'scroll 300px' }]).map(frame => frame.scrollY), []);
  const long = Array.from({ length: 14 }, (_, index) => ({ label: `scroll ${(index + 1) * 820}px` }));
  assert.equal(scrollSections(long).length, 6);
});
