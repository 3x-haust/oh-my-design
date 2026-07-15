import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSlopSource, type SlopSourceCandidateId } from '../core/slop/index.ts';

const repository = fileURLToPath(new URL('..', import.meta.url));
const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const temp = (): string => mkdtempSync(join(tmpdir(), 'omd-slop-source-'));

function write(root: string, path: string, content: string | Uint8Array): string {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function ids(root: string): SlopSourceCandidateId[] {
  return scanSlopSource(root).candidates.map((item) => item.candidateId);
}

const detectorCases: Array<{
  id: SlopSourceCandidateId;
  extension: string;
  positive: string;
  negative: string;
}> = [
  {
    id: 'mid-sentence-break', extension: 'html',
    positive: '<h1>Build work that<br>people remember</h1>',
    negative: '<h1>Build work that matters.<br>People remember it.</h1><div>Loose<br>decoration</div>',
  },
  {
    id: 'all-property-transition', extension: 'css',
    positive: '.button { transition: all 180ms ease; }',
    negative: '.button { transition: color 180ms ease, transform 180ms ease; }',
  },
  {
    id: 'repeated-kicker-treatment', extension: 'tsx',
    positive: '<><p className="kicker">One</p><p className="kicker">Two</p><p className="kicker">Three</p></>',
    negative: '<><p className="kicker">One</p><p className="kicker">Two</p><p className="label">Three</p></>',
  },
  {
    id: 'animated-status-glow', extension: 'tsx',
    positive: '<div className="status shadow-emerald-500"><span className="animate-ping" /> Online</div>',
    negative: '<div className="status-dot">Online</div><code className="animate-pulse">wait()</code>',
  },
  {
    id: 'rounded-accent-callout', extension: 'html',
    positive: '<aside class="rounded-xl border-l-4 border-l-amber-500">Notice</aside>',
    negative: '<aside class="border-l-4 border-l-amber-500">Notice</aside><aside class="rounded-xl">Aside</aside>',
  },
  {
    id: 'decorative-ordinal-run', extension: 'jsx',
    positive: '<><b className="ordinal-display">01</b><b className="ordinal-display">02</b><b className="ordinal-display">03</b></>',
    negative: '<ol><li>01</li><li>02</li><li>03</li></ol><p>Step 01, step 02, step 03.</p>',
  },
  {
    id: 'default-font-pair', extension: 'css',
    positive: '@import url("Inter"); .title { font-family: "Space Grotesk"; } body { font-family: Inter; }',
    negative: 'body { font-family: Inter, system-ui, sans-serif; }',
  },
  {
    id: 'global-terminal-styling', extension: 'scss',
    positive: 'main { font-family: "JetBrains Mono", monospace; }',
    negative: 'body { font-family: system-ui; } code, pre { font-family: "JetBrains Mono", monospace; }',
  },
];

for (const fixture of detectorCases) {
  test(`${fixture.id}: compound source context is a candidate`, () => {
    const root = temp();
    write(root, `surface.${fixture.extension}`, fixture.positive);
    assert.ok(ids(root).includes(fixture.id));
  });

  test(`${fixture.id}: nearby but incomplete context stays clear`, () => {
    const root = temp();
    write(root, `surface.${fixture.extension}`, fixture.negative);
    assert.ok(!ids(root).includes(fixture.id));
  });
}

test('repeated-kicker-treatment catches a tracked uppercase micro-label cluster', () => {
  const root = temp();
  write(root, 'surface.tsx', [
    '<p className="text-xs uppercase tracking-widest">Research</p>',
    '<p className="uppercase tracking-wide">Method</p>',
    '<p className="text-sm uppercase tracking-wider">Result</p>',
  ].join('\n'));
  const item = scanSlopSource(root).candidates.find((candidate) => candidate.candidateId === 'repeated-kicker-treatment');
  assert.deepEqual(item?.signals, ['role:tracked-uppercase', 'cluster:3-plus']);
  assert.equal(item?.line, 3);
});

test('one or two tracked uppercase micro-labels do not form a cluster', () => {
  const root = temp();
  write(root, 'surface.tsx', [
    '<p className="text-xs uppercase tracking-widest">Research</p>',
    '<p className="uppercase tracking-wide">Method</p>',
    '<p className="uppercase">Result</p>',
  ].join('\n'));
  assert.ok(!ids(root).includes('repeated-kicker-treatment'));
});

test('default-font-pair catches imported and invoked next/font/google pairs', () => {
  const root = temp();
  write(root, 'fonts.tsx', [
    "import { Inter, Space_Grotesk } from 'next/font/google';",
    "const body = Inter({ subsets: ['latin'] });",
    "const display = Space_Grotesk({ subsets: ['latin'] });",
  ].join('\n'));
  const item = scanSlopSource(root).candidates.find((candidate) => candidate.candidateId === 'default-font-pair');
  assert.deepEqual(item?.signals, ['family:inter', 'family:space-grotesk', 'context:next-font-google']);
  assert.equal(item?.line, 3);
});

test('a single invoked Inter import is not a default-font pair', () => {
  const root = temp();
  write(root, 'fonts.tsx', [
    "import { Inter } from 'next/font/google';",
    "const body = Inter({ subsets: ['latin'] });",
  ].join('\n'));
  assert.ok(!ids(root).includes('default-font-pair'));
});

test('next/font/google aliases with dollar and underscore report the partner call line', () => {
  const root = temp();
  write(root, 'fonts.tsx', [
    "import { Inter as $body, Space_Grotesk as Display_Font } from 'next/font/google';",
    "const body = $body({ subsets: ['latin'] });",
    'const role = body.className;',
    "const display = Display_Font({ subsets: ['latin'] });",
  ].join('\n'));
  const item = scanSlopSource(root).candidates.find((candidate) => candidate.candidateId === 'default-font-pair');
  assert.deepEqual(item?.signals, ['family:inter', 'family:space-grotesk', 'context:next-font-google']);
  assert.equal(item?.line, 4);
});

test('an imported but uninvoked next/font partner is not a default-font pair', () => {
  const root = temp();
  write(root, 'fonts.tsx', [
    "import { Inter, Space_Grotesk } from 'next/font/google';",
    "const body = Inter({ subsets: ['latin'] });",
    'export { body };',
  ].join('\n'));
  assert.ok(!ids(root).includes('default-font-pair'));
});

test('multiline JSX attributes retain their lexical compound', () => {
  const root = temp();
  write(root, 'surface.tsx', [
    '<main',
    '  className={"font-mono"}',
    '>',
    '  Console',
    '</main>',
  ].join('\n'));
  const item = scanSlopSource(root).candidates.find((candidate) => candidate.candidateId === 'global-terminal-styling');
  assert.equal(item?.line, 2);
});

test('dark, warm, monospace viewport shell is a global terminal candidate', () => {
  const root = temp();
  write(root, 'surface.tsx', '<div className="min-h-screen bg-zinc-950 text-amber-300 font-mono">Console</div>');
  assert.ok(ids(root).includes('global-terminal-styling'));
});

test('comments are ignored without shifting Unicode code-unit line locations', () => {
  const root = temp();
  write(root, 'surface.tsx', [
    'const label = "한국어 😀";',
    '// <main className="font-mono">comment only</main>',
    '/* .x { transition: all 2s; } */',
    '<h2>실제 문장이',
    '  <br />이어집니다</h2>',
  ].join('\n'));
  const result = scanSlopSource(root);
  assert.deepEqual(result.candidates.map((item) => item.candidateId), ['mid-sentence-break']);
  assert.equal(result.candidates[0]?.line, 5);
});

test('fixed skip policy excludes generated, test, dependency, hidden, minified, unsafe and oversized inputs', () => {
  const root = temp();
  const signal = '<main class="font-mono">hidden candidate</main>';
  for (const path of [
    'agents/generated.js', 'skills/generated.ts', 'dist/output.js', 'build/output.js',
    'out/output.js', 'coverage/output.js', '.next/output.js', '.nuxt/output.js',
    'vendor/output.js', 'node_modules/pkg/output.js', 'test/output.js', 'tests/output.js',
    '__tests__/output.js', 'fixtures/output.js', 'snapshots/output.js', '.hidden/output.js',
    'surface.min.js',
  ]) write(root, path, signal);
  write(root, 'package-lock.json', signal);
  write(root, 'docs/guide.md', signal);
  write(root, 'binary.js', new Uint8Array([60, 0, 109, 97, 105, 110, 62]));
  write(root, 'invalid.ts', new Uint8Array([0xc3, 0x28]));
  write(root, 'large.ts', `${' '.repeat(512 * 1024)}x`);
  const external = temp();
  write(external, 'escaped.ts', signal);
  symlinkSync(join(external, 'escaped.ts'), join(root, 'linked.ts'));
  symlinkSync(external, join(root, 'linked-dir'));
  write(root, 'safe.ts', 'export const safe = true;');

  const result = scanSlopSource(root);
  assert.equal(result.filesScanned, 1);
  assert.deepEqual(result.candidates, []);
});

test('JSON is deterministic, sorted, contains controlled signals, and never includes source excerpts', () => {
  const root = temp();
  write(root, 'z.css', '.x { transition: all 1s; } /* SECRET_TOKEN=zebra */');
  write(root, 'a.html', '<h1>SECRET_TOKEN=orchid<br>must not leak</h1>');
  const first = scanSlopSource(root);
  const second = scanSlopSource(root);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.candidates.map((item) => item.path), ['a.html', 'z.css']);
  const encoded = JSON.stringify(first);
  assert.ok(!encoded.includes('SECRET_TOKEN'));
  assert.ok(first.candidates.every((item) => item.signals.every((signal) => /^[a-z]+:[a-z0-9-]+$/.test(signal))));
  assert.ok(first.candidates.every((item) => !('excerpt' in item) && !('severity' in item) && !('score' in item)));
});

test('scan is read-only and does not merge source candidates with rendered IR findings', () => {
  const root = temp();
  const path = write(root, 'surface.html', '<p>Keep this exact SECRET<br>unchanged</p>');
  const before = createHash('sha256').update(readFileSync(path)).digest('hex');
  const result = scanSlopSource(root);
  const after = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(after, before);
  assert.equal(result.candidates.length, 1);
  const implementation = readFileSync(join(repository, 'core/slop/index.ts'), 'utf8');
  assert.doesNotMatch(implementation, /Violation|core\/ir|history|coach/i);
});

test('CLI returns zero when candidates exist and emits stable JSON without excerpts', () => {
  const root = temp();
  write(root, 'surface.css', '.button { transition: all 120ms linear; }');
  const result = spawnSync(process.execPath, [cli, 'slop', 'scan', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as ReturnType<typeof scanSlopSource>;
  assert.equal(parsed.schemaVersion, '1.0');
  assert.equal(parsed.candidates[0]?.candidateId, 'all-property-transition');
  assert.ok(!result.stdout.includes('.button'));
});

test('missing root is an operational CLI failure', () => {
  const root = join(temp(), 'missing');
  const result = spawnSync(process.execPath, [cli, 'slop', 'scan', root, '--json'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /root is not readable/);
});
