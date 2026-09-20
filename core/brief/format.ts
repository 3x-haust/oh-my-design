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
  if (brief.entryGate) section('entry gate', [
    `${brief.entryGate.command} — ${brief.entryGate.runBy}; selected: ${brief.entryGate.selected ?? 'unknown'}`,
    'Nonzero stops entry. Passing proves current prerequisites only, not completion.',
  ]);
  section('owns', brief.owns);
  if (brief.existingDesignSystem) section('existing UI', [
    `${brief.existingDesignSystem.path} — ${brief.existingDesignSystem.status}; ${brief.existingDesignSystem.observations} observations, ${brief.existingDesignSystem.gaps} gaps`,
    'Observed, not approved. Preserve existing tokens/components by default; read .omd/design-system-decisions.md if present and record intentional departures. Inspect coverage gaps before reuse.',
  ]);
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
  if (brief.referenceApplication) section('screen use', [
    `Plan @ ${brief.referenceApplication.applicationSha256}; verify in renders, not an approval or proof of use.`,
    ...brief.referenceApplication.screens.flatMap(row => [row.surface,
      ...(['domain', 'design'] as const).flatMap(key => [
        `${key} (${row[key].coverage}): ${row[key].application}`,
        `do not transfer: ${row[key].doNotTransfer}; reason: ${row[key].reason}`,
        ...(row[key].gap === null ? [] : [`gap: ${row[key].gap}`]),
      ]), ...row.checks.map(check => `verify: ${check}`),
    ]),
  ]);
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
