import type { Brief } from './index.ts';

/** Bounded evidence rendering for a selected stage brief. */
export function formatBrief(brief: Brief): string {
  const lines: string[] = [];
  const section = (label: string, entries: readonly string[]): void => {
    if (entries.length === 0) return;
    lines.push(`${label.padEnd(13)} ${entries[0]}`);
    for (const entry of entries.slice(1)) lines.push(`${' '.repeat(13)} ${entry}`);
  };

  lines.push(`stage         ${brief.stage}  (owner: ${brief.owner})`);
  section('owns', brief.owns);
  if (brief.route !== null) {
    section('route', [`${brief.route.name} — ${brief.route.roles.join(', ')}`, `references: ${brief.route.references}`]);
  }
  section('references', [
    ...brief.references.map((entry) => {
      const take = entry.take.length === 0 ? '' : `  take: ${entry.take[0]}`;
      return `${entry.path}${entry.slot === null ? '' : ` [${entry.slot}]`}${take}`;
    }),
    ...(brief.referencesOmitted > 0 ? [`+${brief.referencesOmitted} more — omd ref list`] : []),
  ]);
  section('contracts', brief.contracts.map((entry) => `${entry.path}${entry.delivered ? '' : '  (undelivered)'}`));
  section('inputs', brief.schemas.map((entry) => `${entry.name}: ${entry.command}`));
  if (brief.shell !== null) section('shell', [`${brief.shell.kind} — ${brief.shell.target}`]);
  section('judged by', brief.judgedBy.map((entry) => `${entry.command}  →  fails when ${entry.fails}`));
  section('prior', brief.prior);
  section('blockers', brief.blockers);
  return `${lines.join('\n')}\n`;
}
