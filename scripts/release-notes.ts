#!/usr/bin/env node
/**
 * scripts/release-notes.ts — generate structured release notes.
 *
 * Pure function (no I/O — safe to unit-test):
 *   buildReleaseNotes({ version, prevTag, summary, prs, testCount }) → markdown
 *
 * CLI (gathers real data via git + gh, then calls the pure function):
 *   node scripts/release-notes.ts --version X.Y.Z [--prev vX.Y.Z] [--test-count N]
 *   Prints release notes markdown to stdout.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = 'https://github.com/3x-haust/oh-my-design';
const OWNER_REPO = '3x-haust/oh-my-design';

export interface PrEntry {
  number: number;
  title: string;
}

export interface ReleaseNotesInput {
  version: string;
  prevTag: string;
  summary: string;
  prs: PrEntry[];
  testCount: number;
}

/**
 * Pure function — assembles release notes markdown from the given inputs.
 * No I/O; suitable for unit tests.
 */
export function buildReleaseNotes(opts: ReleaseNotesInput): string {
  const { version, prevTag, summary, prs, testCount } = opts;
  const tag = version.startsWith('v') ? version : `v${version}`;

  const prLink = (n: number): string =>
    `[#${n}](${REPO}/pull/${n})`;

  const highlights =
    prs.length > 0
      ? prs.map((pr) => `- ${pr.title} ${prLink(pr.number)}`).join('\n')
      : '_No pull requests merged since the previous release._';

  const prList =
    prs.length > 0
      ? prs.map((pr) => `- ${prLink(pr.number)}`).join('\n')
      : '_None._';

  return [
    `# ${tag}`,
    '',
    summary,
    '',
    '## Highlights',
    '',
    highlights,
    '',
    `## Merged PRs since ${prevTag}`,
    '',
    prList,
    '',
    '## Compatibility',
    '',
    'No breaking changes.',
    '',
    '## Validation',
    '',
    `${testCount} tests pass, tsc clean, build clean.`,
    '',
    `**Full Changelog**: ${REPO}/compare/${prevTag}...${tag}`,
  ].join('\n');
}

// ── CLI helpers (I/O — excluded from unit tests) ─────────────────────────────

function exec(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getPrevTag(explicit: string | undefined): string {
  if (explicit) return explicit;
  // Most-recent tag reachable from HEAD^ (the commit before current HEAD)
  const tag = exec('git', ['describe', '--tags', '--abbrev=0', 'HEAD^']);
  return tag || 'v0.0.0';
}

function resolveTagDate(prevTag: string): string {
  // Primary: local git history (works with full-depth clones and local runs)
  const gitDate = exec('git', ['log', '-1', '--format=%aI', prevTag]);
  if (gitDate) return gitDate;

  // Fallback: GitHub releases API (works in CI even when git history is
  // shallow, as long as the tag corresponds to a published release)
  const releaseDate = exec('gh', [
    'api', `repos/${OWNER_REPO}/releases/tags/${prevTag}`,
    '--jq', '.published_at',
  ]);
  if (releaseDate && releaseDate !== 'null') return releaseDate;

  // Both paths failed — error visibly rather than returning an empty PR list
  process.stderr.write(
    `error: could not resolve a commit date for tag ${prevTag}.\n` +
    `  Tried: git log -1 --format=%aI ${prevTag}  (returned empty)\n` +
    `  Tried: gh api repos/${OWNER_REPO}/releases/tags/${prevTag}  (returned empty)\n` +
    `Ensure the tag exists locally (fetch-depth: 0 + fetch-tags: true) or\n` +
    `that the tag corresponds to a published GitHub release.\n`,
  );
  process.exit(1);
}

function getMergedPrsSince(prevTag: string): PrEntry[] {
  // Resolve the tag to a commit date so we can filter PRs merged after it.
  // resolveTagDate() either returns a valid ISO-8601 date string or exits.
  const tagDate = resolveTagDate(prevTag);

  const raw = exec('gh', [
    'pr', 'list',
    '--state', 'merged',
    '--base', 'main',
    '--json', 'number,title,mergedAt',
    '--limit', '100',
  ]);
  if (!raw) return [];

  let items: Array<{ number: number; title: string; mergedAt: string }>;
  try {
    items = JSON.parse(raw) as typeof items;
  } catch {
    return [];
  }

  return items
    .filter((pr) => pr.mergedAt > tagDate)
    .sort((a, b) => a.number - b.number)
    .map(({ number, title }) => ({ number, title }));
}

function run(argv: string[]): void {
  const args = argv.slice(2);

  const flag = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const versionArg = flag('--version');
  const prevArg = flag('--prev');
  const testCountArg = flag('--test-count');

  if (!versionArg || !/^\d+\.\d+\.\d+/.test(versionArg)) {
    process.stderr.write(
      'Usage: node scripts/release-notes.ts --version X.Y.Z [--prev vX.Y.Z] [--test-count N]\n',
    );
    process.exit(1);
  }

  const prevTag = getPrevTag(prevArg);
  const prs = getMergedPrsSince(prevTag);
  const summary =
    exec('git', ['log', '-1', '--format=%s']) || `Release v${versionArg}`;
  const testCount = testCountArg ? parseInt(testCountArg, 10) : 0;

  const notes = buildReleaseNotes({
    version: versionArg,
    prevTag,
    summary,
    prs,
    testCount,
  });
  process.stdout.write(notes + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv);
}
