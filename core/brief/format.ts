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
    section('route', [
      `${brief.route.name}/${brief.route.projectMode} — ${brief.route.roles.join(', ')}`,
      `references: ${brief.route.references}`,
    ]);
  }
  if (brief.contentGrain !== null) {
    section('grain', [
      `${brief.contentGrain.path} — ${brief.contentGrain.status} @ ${brief.contentGrain.sha256.slice(0, 12)}`,
    ]);
  }
  if (brief.designQuality != null) {
    const quality = brief.designQuality;
    section('quality', [
      `candidateMode: ${quality.candidateMode}`,
      `axes: ${quality.axes.join(', ')}`,
      `floor: ${quality.floor}`,
      `floors: ${quality.axes.map((axis) => `${axis}=${quality.floors[axis]}`).join(', ')}`,
      `aggregation: ${quality.aggregation}`,
      `evidence: ${quality.evidence}`,
      `fidelityCanSubstitute: ${quality.fidelityCanSubstitute}`,
    ]);
  }
  if (brief.localeDesign !== null) {
    section('locale', [
      `${brief.localeDesign.decision} — ${brief.localeDesign.surfaceLocale}`,
      `context: ${brief.localeDesign.contextPath} @ ${brief.localeDesign.contextSha256.slice(0, 12)}`,
      `market/audience: ${brief.localeDesign.marketRegion ?? 'withheld'} / ${brief.localeDesign.audience ?? 'withheld'}`,
      ...(brief.localeDesign.projection === null
        ? []
        : [`projection: ${brief.localeDesign.projection.path} @ ${brief.localeDesign.projection.sha256.slice(0, 12)}`]),
      ...(brief.localeDesign.referenceBinding === null
        ? []
        : [`reference binding: ${brief.localeDesign.referenceBinding.path} @ ${brief.localeDesign.referenceBinding.sha256.slice(0, 12)}`]),
    ]);
  }
  if (brief.reality !== null) {
    section('reality', [
      brief.reality.mode,
      ...brief.reality.facts.map((fact) => (
        `${fact.category}/${fact.status}: ${fact.statement}${fact.source === undefined ? '' : ` (${fact.source})`}`
      )),
    ]);
  }
  if (brief.discovery != null) {
    section('discovery', [
      `${brief.discovery.command} — automatic; user reference URLs are optional`,
      `lanes: ${brief.discovery.lanes.join(', ')}`,
      ...(brief.discovery.motionEvidenceRequired ? ['positive motion evidence required even when domain analysis is skipped'] : []),
    ]);
  }
  section('references', [
    ...brief.references.map((entry) => {
      const take = entry.take.length === 0 ? '' : `  take: ${entry.take[0]}`;
      return `${entry.path}${entry.slot === null ? '' : ` [${entry.slot}]`}${take}`;
    }),
    ...(brief.referencesOmitted > 0 ? [`+${brief.referencesOmitted} more — omd ref list`] : []),
  ]);
  section('contracts', brief.contracts.map((entry) => `${entry.path}${entry.delivered ? '' : '  (undelivered)'}`));
  if (brief.referenceHandoff != null) {
    section('reference data', [
      brief.referenceHandoff.command,
      `${brief.referenceHandoff.pieces} selected pieces @ ${brief.referenceHandoff.sha256}`,
    ]);
  }
  section('inputs', brief.schemas.map((entry) => `${entry.name}: ${entry.command}`));
  if (brief.shell !== null) section('shell', [`${brief.shell.kind} — ${brief.shell.target}`]);
  section('judged by', brief.judgedBy.map((entry) => `${entry.command}  →  fails when ${entry.fails}`));
  section('prior', brief.prior);
  section('blockers', brief.blockers);
  return `${lines.join('\n')}\n`;
}
