import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLocaleCopyBinding, validateLocaleContract } from '../core/locale/contract.ts';

// A second locale is a second audience, not a second string table. The two obligations that can be
// checked before a browser exists are a coherent contract and real copy for every declared locale;
// a blank cell is a hole in the page for that visitor, never a silent fallback.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-locale-'));

const contract = (overrides: Record<string, unknown> = {}) => ({
  schema: 'locale-contract-v1', mode: 'language-only', locales: ['ko-KR', 'en-US'], primary: 'ko-KR', ...overrides,
});

const deck = (rows: string): string => [
  '# Copy', '',
  '## Art direction contract', '',
  '| Beat ID | Evidence IDs |',
  '| --- | --- |',
  '| B-1 | F-001 |',
  '| B-2 | F-002 |', '',
  '## Locale copy', '',
  '| Beat ID | ko-KR | en-US |',
  '| --- | --- | --- |',
  rows, '',
].join('\n');

function write(dir: string, relative: string, content: string): string {
  const path = join(dir, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

test('a locale contract needs two unique tags, a known mode, and a primary among them', () => {
  assert.equal(validateLocaleContract(contract()).primary, 'ko-KR');
  assert.throws(() => validateLocaleContract(contract({ locales: ['ko-KR'] })), /two or more BCP-47 tags/);
  assert.throws(() => validateLocaleContract(contract({ locales: ['ko-KR', 'ko-KR'] })), /locales must be unique/);
  assert.throws(() => validateLocaleContract(contract({ primary: 'ja-JP' })), /primary must be one of the declared locales/);
  assert.throws(() => validateLocaleContract(contract({ mode: 'translated' })), /mode must be one of/);
  assert.throws(() => validateLocaleContract(contract({ locales: ['korean', 'english'] })), /BCP-47/);
  assert.throws(() => validateLocaleContract({ ...contract(), extra: 1 }), /unknown: extra/);
});

test('every declared Beat needs real copy in every declared locale', () => {
  const complete = checkLocaleCopyBinding(validateLocaleContract(contract()), deck([
    '| B-1 | 소스에서 근거를 수집합니다 | Collects evidence from the source |',
    '| B-2 | 결정을 기록으로 남깁니다 | Records each decision |',
  ].join('\n')));
  assert.deepEqual(complete, []);

  const holes = checkLocaleCopyBinding(validateLocaleContract(contract()), deck([
    '| B-1 | 소스에서 근거를 수집합니다 |  |',
    '| B-2 | TBD | Records each decision |',
  ].join('\n')));
  assert.deepEqual(holes.map((finding) => finding.id), ['LOCALE-COPY-MISSING', 'LOCALE-COPY-PLACEHOLDER']);
  assert.match(holes[0]!.message, /Beat B-1 has no en-US copy/);
});

test('locale copy may not invent or skip a Beat the art direction declares', () => {
  const invented = checkLocaleCopyBinding(validateLocaleContract(contract()), deck([
    '| B-1 | 한국어 | English |',
    '| B-2 | 한국어 | English |',
    '| B-9 | 한국어 | English |',
  ].join('\n')));
  assert.deepEqual(invented.map((finding) => finding.id), ['LOCALE-BEAT-UNKNOWN']);

  const skipped = checkLocaleCopyBinding(validateLocaleContract(contract()), deck('| B-1 | 한국어 | English |'));
  assert.deepEqual(skipped.map((finding) => finding.id), ['LOCALE-BEAT-UNCOVERED']);
  assert.match(skipped[0]!.message, /Beat B-2 has no row/);
});

test('a missing locale column and a missing section both fail with a named reason', () => {
  const missingColumn = checkLocaleCopyBinding(
    validateLocaleContract(contract({ locales: ['ko-KR', 'en-US', 'ja-JP'], mode: 'market-specific' })),
    deck(['| B-1 | 한국어 | English |', '| B-2 | 한국어 | English |'].join('\n')),
  );
  assert.equal(missingColumn[0]!.id, 'LOCALE-COLUMN-MISSING');
  assert.match(missingColumn[0]!.message, /no ja-JP column/);

  const noSection = checkLocaleCopyBinding(validateLocaleContract(contract()), '# Copy\n\n## Art direction contract\n\n| Beat ID | Evidence IDs |\n| --- | --- |\n| B-1 | F-001 |\n');
  assert.deepEqual(noSection.map((finding) => finding.id), ['LOCALE-DECK-SECTION']);
});

test('the locale gate exits non-zero on a hole and zero on a complete deck', () => {
  const dir = project();
  write(dir, '.omd/locale.json', JSON.stringify(contract()));
  write(dir, '.omd/copy-deck.md', deck('| B-1 | 한국어 | English |'));
  const blocked = run(['locale', 'check', '--json'], dir);
  assert.equal(blocked.status, 1, blocked.stdout);
  assert.deepEqual(JSON.parse(blocked.stdout).findings.map((finding: { id: string }) => finding.id), ['LOCALE-BEAT-UNCOVERED']);

  write(dir, '.omd/copy-deck.md', deck(['| B-1 | 한국어 | English |', '| B-2 | 한국어 | English |'].join('\n')));
  const passing = run(['locale', 'check'], dir);
  assert.equal(passing.status, 0, passing.stderr);
  assert.match(passing.stdout, /ok — language-only contract covers ko-KR, en-US with primary ko-KR/);
});
