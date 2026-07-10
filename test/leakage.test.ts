import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.ts';
import { findLeakedRationale } from '../core/rules/leakage.ts';
import { loadRules, check } from '../core/rules/engine.ts';
import type { RawIr, RawNode, Violation } from '../core/types.ts';
import { must } from './helpers.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-leakage-'));

const textNode = (id: string, text: string): RawNode => ({
  id,
  name: 'Hero',
  type: 'TEXT',
  path: `Screen/${id}`,
  parent: null,
  box: { x: 0, y: 0, w: 100, h: 40 },
  children: [],
  text,
});

const irWith = (nodes: RawNode[]): RawIr => ({ nodes });

const REFRAME = '"느리다", "안 된다" 다음 문장이 없는 글은 쓰지 않는다';
const FRAME_MD = `---\nwhy: evidence\n---\n\n## The reframing\n\n${REFRAME}\n`;

test('a node quoting 5+ consecutive tokens from a record fires, with the window in value', () => {
  const ir = normalize(irWith([
    textNode('n1', 'We believe design should never settle for the mean of everything a model has ever seen today.'),
  ]));
  const records = ['Every rule here describes a design that has converged on the mean of everything a model has ever seen.'];
  const v = findLeakedRationale(ir, records);
  assert.equal(v.length, 1);
  assert.equal(v[0]?.id, 'SLOP-LEAKED-RATIONALE');
  assert.equal(v[0]?.category, 'slop');
  assert.equal(v[0]?.severity, 'warn');
  assert.equal(typeof v[0]?.value, 'string');
  assert.match(String(v[0]?.value), /mean of everything a/);
});

test('a paraphrase with under 5 consecutive tokens of overlap does not fire', () => {
  const ir = normalize(irWith([
    textNode('n1', 'This product avoids generic language and speaks plainly about what it actually does for you.'),
  ]));
  const records = ['Every rule here describes a design that has converged on the mean of everything a model has ever seen.'];
  const v = findLeakedRationale(ir, records);
  assert.equal(v.length, 0);
});

test('short text under 6 tokens never fires, even quoting a record exactly', () => {
  const ir = normalize(irWith([textNode('n1', 'mean of everything model')]));
  const records = ['the mean of everything a model has ever seen'];
  const v = findLeakedRationale(ir, records);
  assert.equal(v.length, 0);
});

test('empty records produce no violations', () => {
  const ir = normalize(irWith([textNode('n1', 'Any sentence long enough to qualify for scanning goes here today.')]));
  assert.deepEqual(findLeakedRationale(ir, []), []);
  assert.deepEqual(findLeakedRationale(ir, ['']), []);
});

test('markdown syntax is stripped: emphasis/backtick noise does not block a real match', () => {
  const ir = normalize(irWith([
    textNode('n1', 'Every rule here describes a design that has converged on the mean of everything today.'),
  ]));
  const records = ['# Heading\n\n**Every rule here** describes a design that has *converged* on the `mean` of things.'];
  const v = findLeakedRationale(ir, records);
  assert.equal(v.length, 1);
});

test('markdown heading syntax alone does not create junk grams that spuriously match unrelated text', () => {
  const ir = normalize(irWith([
    textNode('n1', 'The reframing is the section that explains why this shape was chosen over the others.'),
  ]));
  const records = ['## The reframing\n\n* bullet one\n* bullet two\n> a quote\n`code`'];
  const v = findLeakedRationale(ir, records);
  assert.equal(v.length, 0);
});

// F4: the record's frontmatter block must be stripped before tokenizing, not just its
// `---` fences (those were already turned into spaces by the punctuation strip). The
// record's `why:` field holds a sentence that never appears in the record's body; a page
// quoting that sentence must not fire, because after the frontmatter block is removed
// entirely, none of its tokens (including the "why:" key) survive into the record grams.
test('leaked-rationale check strips YAML frontmatter: a why-field sentence absent from the body does not fire', () => {
  const record = '---\nwhy: users bounce fast on slow pages today\n---\n\n## Body\n\nThis section talks about something else entirely and never repeats the frontmatter line.\n';
  const ir = normalize(irWith([
    textNode('n1', 'Our research found that users bounce fast on slow pages today, sadly.'),
  ]));
  const v = findLeakedRationale(ir, [record]);
  assert.equal(v.length, 0);
});

test('Korean: the frame reframing sentence embedded verbatim in a text node fires', () => {
  const ir = normalize(irWith([
    textNode('n1', `이 서비스의 원칙은 ${REFRAME} 라는 것입니다`),
  ]));
  const v = findLeakedRationale(ir, [FRAME_MD]);
  assert.equal(v.length, 1);
  assert.equal(v[0]?.id, 'SLOP-LEAKED-RATIONALE');
});

test('CLI: a page whose hero embeds the frame reframing sentence exits 1 and reports SLOP-LEAKED-RATIONALE', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'frame.md'), FRAME_MD);

  const irPath = join(dir, 'page.json');
  writeFileSync(irPath, JSON.stringify(irWith([
    textNode('n1', `우리의 원칙: ${REFRAME}`),
  ])));

  const r = run(['check', '--ir', irPath], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SLOP-LEAKED-RATIONALE/);
});

test('CLI: the same page with no .omd present reports no leak violation', () => {
  const dir = project();
  const irPath = join(dir, 'page.json');
  writeFileSync(irPath, JSON.stringify(irWith([
    textNode('n1', `우리의 원칙: ${REFRAME}`),
  ])));

  const r = run(['check', '--ir', irPath], dir);
  assert.doesNotMatch(r.stdout, /SLOP-LEAKED-RATIONALE/);
});

// ── SLOP-COPY: self-negating meta-copy is filler too. ──

// F2: the `we (?:don't|do not|never) (?:use|do|write)` branch was removed (it fired on
// legitimate privacy/policy copy — "We don't use third-party trackers"), so this fixture
// was changed from "We don't use jargon here" to "No jargon here" — it still matches the
// kept `no (?:fluff|jargon|nonsense) here` branch and preserves the test's intent.
test('SLOP-COPY also fires on self-negating meta-copy ("no jargon here")', () => {
  const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);
  const node: RawNode = textNode('n1', 'No jargon here, just plain facts.');
  const ir = normalize(irWith([node]));
  const v: Violation[] = check(ir, builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-COPY'), must(v[0], 'at least one slop violation').id);
});

// F2: false-positive regression — these are ordinary, legitimate prose and must NOT fire.
test('SLOP-COPY does not fire on legitimate privacy/policy and empty-state copy', () => {
  const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);
  const cases = [
    'We don\'t use third-party trackers or sell your data.',
    '이를 통해 알 수 있듯이 사용자는 빠른 응답을 원한다.',
    '이 사이트는 쿠키를 사용하지 않습니다.',
  ];
  for (const text of cases) {
    const ir = normalize(irWith([textNode('n1', text)]));
    const v: Violation[] = check(ir, builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-COPY'), `should not fire on: "${text}"`);
  }
});

// F3: the Korean self-negation pattern moved from SLOP-COPY to SLOP-PINK-ELEPHANT,
// which covers the full family (이런 내용|것 + 여기/이 페이지에는 ...).
test('SLOP-PINK-ELEPHANT fires on the Korean self-negating pattern ("이런 내용은 없습니다")', () => {
  const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);
  const ir = normalize(irWith([textNode('n1', '이런 내용은 없습니다, 저희는 다르게 접근합니다.')]));
  const v: Violation[] = check(ir, builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-PINK-ELEPHANT'), must(v[0], 'at least one slop violation').id);
});
