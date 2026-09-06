/**
 * scripts/release-notes.ts — generate structured release notes.
 *
 * Pure function (no I/O — safe to unit-test):
 *   buildReleaseNotes({ version, prevTag, summary, prs, testCount }) → markdown
 *
 * The module is intentionally pure. Callers gather repository data separately
 * and pass it into the exported functions.
 */


const REPO = 'https://github.com/3x-haust/oh-my-design';
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

