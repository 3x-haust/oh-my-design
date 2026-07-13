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

/**
 * Pure helper — parses PR entries from an array of squash-merge commit subject
 * lines. Each subject line is expected to have the form:
 *   <title> (#N)
 *
 * Lines that carry no `(#N)` reference are ignored. Release commits whose
 * titles match `chore: release` are excluded. Duplicate PR numbers are
 * deduplicated. The result is sorted ascending by PR number.
 *
 * Pure function — no I/O; suitable for unit tests.
 */
export function parsePrsFromCommitMessages(messages: string[]): PrEntry[] {
  const seen = new Set<number>();
  const result: PrEntry[] = [];

  for (const msg of messages) {
    const match = msg.match(/^(.+?)\s+\(#(\d+)\)/);
    if (!match) continue;

    const title = match[1]!.trim();
    const number = parseInt(match[2]!, 10);

    // Exclude the release/bump PR itself
    if (/^chore:\s*release/i.test(title)) continue;

    if (seen.has(number)) continue;
    seen.add(number);

    result.push({ number, title });
  }

  return result.sort((a, b) => a.number - b.number);
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

function getMergedPrsSince(prevTag: string): PrEntry[] {
  // The commit range prevTag..HEAD is the exact set the release ships. Read it
  // from local git — the release workflow fetches full history and tags
  // (fetch-depth: 0), so `git log` resolves the range without any network call.
  // Each squash-merge subject is "<title> (#N)", so PR numbers parse straight
  // from the subjects. The GitHub compare API is avoided on purpose: it does not
  // resolve a literal "HEAD" ref server-side, which silently emptied the list.
  //
  // A missing/unknown prevTag (first release) makes the range invalid; exec()
  // returns '' and we fall back to an empty list ("initial release").
  const range = prevTag && prevTag !== 'v0.0.0' ? `${prevTag}..HEAD` : 'HEAD';
  const raw = exec('git', ['log', range, '--format=%s']);
  if (!raw) return [];

  const subjects = raw.split('\n').filter(Boolean);
  return parsePrsFromCommitMessages(subjects);
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
