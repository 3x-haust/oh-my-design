import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseNotes, parsePrsFromCommitMessages } from '../scripts/release-notes.ts';

const BASE = {
  version: '0.12.0',
  prevTag: 'v0.11.0',
  summary: 'add structured release notes and visual-target loop',
  prs: [
    { number: 29, title: 'feat: release notes automation' },
    { number: 30, title: 'feat: visual target diff loop' },
  ],
  testCount: 607,
};

// ── title ────────────────────────────────────────────────────────────────────

test('title is the first line and prefixed with v', () => {
  const md = buildReleaseNotes(BASE);
  assert.equal(md.split('\n')[0], '# v0.12.0');
});

test('version string already prefixed with v is not doubled', () => {
  const md = buildReleaseNotes({ ...BASE, version: 'v0.12.0' });
  assert.match(md, /^# v0\.12\.0$/m);
  assert.doesNotMatch(md, /# vv/);
});

// ── summary ──────────────────────────────────────────────────────────────────

test('summary appears as the second non-empty line', () => {
  const md = buildReleaseNotes(BASE);
  const nonEmpty = md.split('\n').filter((l) => l.trim());
  assert.equal(nonEmpty[1], BASE.summary);
});

// ── section ordering ─────────────────────────────────────────────────────────

test('H2 sections appear in the required order', () => {
  const md = buildReleaseNotes(BASE);
  const h2 = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1] ?? '');
  assert.deepEqual(h2, [
    'Highlights',
    `Merged PRs since ${BASE.prevTag}`,
    'Compatibility',
    'Validation',
  ]);
});

// ── PR list rendering ─────────────────────────────────────────────────────────

test('Highlights lists PR titles as bullets', () => {
  const md = buildReleaseNotes(BASE);
  assert.match(md, /- feat: release notes automation/);
  assert.match(md, /- feat: visual target diff loop/);
});

test('Highlights includes inline #N PR links', () => {
  const md = buildReleaseNotes(BASE);
  assert.match(
    md,
    /\[#29\]\(https:\/\/github\.com\/3x-haust\/oh-my-design\/pull\/29\)/,
  );
  assert.match(
    md,
    /\[#30\]\(https:\/\/github\.com\/3x-haust\/oh-my-design\/pull\/30\)/,
  );
});

test('Merged PRs section is a flat list of #N links without titles', () => {
  const md = buildReleaseNotes(BASE);
  const section =
    md.split('## Merged PRs')[1]?.split('## Compatibility')[0] ?? '';
  assert.match(section, /- \[#29\]/);
  assert.match(section, /- \[#30\]/);
  // titles must NOT appear in the flat list
  assert.doesNotMatch(section, /feat: release notes/);
});

// ── empty PR fallback ─────────────────────────────────────────────────────────

test('empty PR list renders fallback text in Highlights', () => {
  const md = buildReleaseNotes({ ...BASE, prs: [] });
  assert.match(md, /No pull requests merged since the previous release/);
});

test('empty PR list renders fallback text in Merged PRs section', () => {
  const md = buildReleaseNotes({ ...BASE, prs: [] });
  const section =
    md.split('## Merged PRs')[1]?.split('## Compatibility')[0] ?? '';
  assert.match(section, /None\./);
});

// ── changelog URL construction ────────────────────────────────────────────────

test('Full Changelog URL is the last line and uses correct prev and curr tags', () => {
  const md = buildReleaseNotes(BASE);
  const last = md.trimEnd().split('\n').at(-1) ?? '';
  assert.equal(
    last,
    '**Full Changelog**: https://github.com/3x-haust/oh-my-design/compare/v0.11.0...v0.12.0',
  );
});

test('changelog URL prefixes bare version numbers with v', () => {
  // version '0.12.0' (no v) + prevTag 'v0.11.0'
  const md = buildReleaseNotes(BASE);
  assert.match(
    md,
    /compare\/v0\.11\.0\.\.\.v0\.12\.0/,
  );
});

// ── Compatibility section ─────────────────────────────────────────────────────

test('Compatibility section states no breaking changes', () => {
  const md = buildReleaseNotes(BASE);
  const section =
    md.split('## Compatibility')[1]?.split('## Validation')[0] ?? '';
  assert.match(section, /No breaking changes/);
});

// ── Validation section ────────────────────────────────────────────────────────

test('Validation section includes testCount', () => {
  const md = buildReleaseNotes({ ...BASE, testCount: 999 });
  assert.match(md, /999 tests pass/);
});

test('Validation section mentions tsc clean and build clean', () => {
  const md = buildReleaseNotes(BASE);
  const section =
    md.split('## Validation')[1]?.split('**Full Changelog')[0] ?? '';
  assert.match(section, /tsc clean/);
  assert.match(section, /build clean/);
});

// ── parsePrsFromCommitMessages ────────────────────────────────────────────────

test('parsePrsFromCommitMessages: parses a standard squash-merge subject', () => {
  const result = parsePrsFromCommitMessages(['feat: x (#12)']);
  assert.deepEqual(result, [{ number: 12, title: 'feat: x' }]);
});

test('parsePrsFromCommitMessages: extracts title text before (#N)', () => {
  const result = parsePrsFromCommitMessages(['fix: correct parsing logic (#99)']);
  assert.equal(result[0]?.title, 'fix: correct parsing logic');
  assert.equal(result[0]?.number, 99);
});

test('parsePrsFromCommitMessages: deduplicates repeated PR numbers', () => {
  const result = parsePrsFromCommitMessages([
    'feat: first (#5)',
    'feat: first (#5)',
  ]);
  assert.equal(result.length, 1);
});

test('parsePrsFromCommitMessages: sorts results ascending by PR number', () => {
  const result = parsePrsFromCommitMessages([
    'feat: c (#30)',
    'feat: a (#10)',
    'feat: b (#20)',
  ]);
  assert.deepEqual(
    result.map((p) => p.number),
    [10, 20, 30],
  );
});

test('parsePrsFromCommitMessages: drops chore: release commits', () => {
  const result = parsePrsFromCommitMessages([
    'feat: real feature (#7)',
    'chore: release v0.5.0 (#8)',
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.number, 7);
});

test('parsePrsFromCommitMessages: ignores lines with no (#N) reference', () => {
  const result = parsePrsFromCommitMessages([
    'chore: update deps',
    'Initial commit',
    'feat: actual pr (#3)',
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.number, 3);
});

test('parsePrsFromCommitMessages: returns empty array for empty input', () => {
  const result = parsePrsFromCommitMessages([]);
  assert.deepEqual(result, []);
});

test('parsePrsFromCommitMessages: handles multi-word scope in conventional commit', () => {
  const result = parsePrsFromCommitMessages(['feat(release-notes): add compare logic (#42)']);
  assert.deepEqual(result, [{ number: 42, title: 'feat(release-notes): add compare logic' }]);
});

// ── policy checks ─────────────────────────────────────────────────────────────

test('output contains no emoji characters', () => {
  const md = buildReleaseNotes(BASE);
  // Unicode emoji block range check
  assert.doesNotMatch(md, /[\u{1F300}-\u{1FAFF}]/u);
});

test('output contains no install instructions', () => {
  const md = buildReleaseNotes(BASE);
  assert.doesNotMatch(md, /npm install/i);
  assert.doesNotMatch(md, /npm i /i);
  assert.doesNotMatch(md, /npx /i);
});
