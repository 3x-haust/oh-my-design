import { invocationFromActivation, parseArgs, projectWriter, type Opts } from '../cli/runtime.ts';

async function cmdStudioRefs(opts: Opts): Promise<never> {
  const urls = opts._.map(String);
  if (urls.length === 0) throw new Error('usage: omd studio refs <url> [<url> ...] [--json]');
  const writer = projectWriter(invocationFromActivation(opts, 'omd studio refs'));
  const { studyStudioReferences } = await import('../../core/design/studio.ts');
  const result = await studyStudioReferences(writer, urls);
  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(result), () => done()));
  else {
    for (const item of result.studied) console.log(`${item.url}: ${item.dir} (${item.screens} screens, ${item.sections} sections, weights ${item.weights.join('/')})`);
    for (const item of result.skipped) console.log(`skipped ${item.url}: ${item.reason}`);
  }
  process.exit(result.studied.length > 0 ? 0 : 1);
}

const out = (opts: Opts, value: unknown, text: string): Promise<void> => opts.json
  ? new Promise<void>(done => process.stdout.write(JSON.stringify(value), () => done())) : Promise.resolve(console.log(text));

async function cmdStudioCheck(opts: Opts): Promise<never> {
  const mode = typeof opts.mode === 'string' ? opts.mode : 'marketing';
  const root = process.cwd();
  const { findingLines, heldFindings, observePageFindings, repeatedTemplate } = await import('../../core/design/studio-page-check.ts');
  const { observeSystemDrift, readStudioSystem, sectionRhythm, studioReferenceDepth, studioReferenceSections, systemDriftFailures, STUDIO_SYSTEM_GUIDANCE }
    = await import('../../core/design/studio.ts');
  const system = readStudioSystem(root);
  const deviations = system?.deviations ?? [];
  if (mode === 'product') {
    const screens = opts._.map(String);
    if (screens.length < 2) throw new Error('usage: omd studio check --mode product <screen> <screen> [...] [--json]   (every screen and state, as URLs or built files)');
    if (system === null) throw new Error(`STUDIO_SYSTEM_MISSING: no system is written yet. ${STUDIO_SYSTEM_GUIDANCE}`);
    const { measureScreens, screenFindings } = await import('../../core/design/studio-screens.ts');
    const measured = await measureScreens(screens);
    const findings = [...screenFindings(measured, system)];
    for (const screen of screens) findings.push(...(await observePageFindings(screen)).filter(finding => finding.tier === 'defect').map(finding => ({ ...finding, message: `${screen}: ${finding.message}` })));
    const lines = findingLines(findings);
    await out(opts, { mode, screens: measured.map(item => ({ screen: item.screen, roles: item.roles })), findings }, lines.length === 0 ? `${screens.length} screens hold one system` : lines.join('\n'));
    process.exit(lines.length === 0 ? 0 : 1);
  }
  if (mode === 'redesign') {
    const { checkRedesign } = await import('../../core/design/studio-screens.ts');
    const writer = projectWriter(invocationFromActivation(opts, 'omd studio check'));
    const result = await checkRedesign(root, writer, typeof opts.origin === 'string' ? opts.origin : null);
    const lines = findingLines(result.findings);
    await out(opts, { mode, ...result }, [`before and after, side by side: ${result.beside.join(', ')}`, ...(lines.length === 0 ? ['every old control and route is kept or recorded as changed'] : lines)].join('\n'));
    process.exit(lines.length === 0 ? 0 : 1);
  }
  if (mode !== 'marketing') throw new Error('omd studio check --mode marketing|product|redesign');
  const page = typeof opts.page === 'string' ? opts.page : 'dist/index.html';
  if (system === null) throw new Error(`STUDIO_SYSTEM_MISSING: no system is written yet. ${STUDIO_SYSTEM_GUIDANCE}`);
  const observations = await observeSystemDrift(page, system);
  const failures = systemDriftFailures(observations, studioReferenceDepth(root), [], true, deviations);
  const sections = observations.find(item => item.viewport === 'desktop')?.sections ?? [];
  const rhythm = sectionRhythm(studioReferenceSections(root), sections);
  const template = repeatedTemplate(sections);
  const findings = heldFindings([...await observePageFindings(page),
    ...(template === null ? [] : [{ tier: 'convention' as const, id: 'varied-sections', viewport: 'desktop' as const, message: template }])], deviations);
  const defects = findingLines(findings.filter(finding => finding.tier === 'defect'));
  const conventions = findingLines(findings.filter(finding => finding.tier === 'convention'));
  const text = [failures.length === 0 && defects.length === 0 ? `${page} holds the system` : [...failures, ...defects].join('\n'),
    ...(conventions.length === 0 ? [] : ['', 'Defaults the page leaves (follow each, or record {"convention", "instead", "because"} under "deviations" in .omd/studio/system.json when the idea needs it):', ...conventions]),
    ...rhythm === null ? [] : ['', rhythm]].join('\n');
  await out(opts, { mode, page, system, observations, failures, findings, rhythm }, text);
  process.exit(failures.length === 0 && defects.length === 0 ? 0 : 1);
}

async function cmdStudioLook(opts: Opts): Promise<never> {
  const page = typeof opts.page === 'string' ? opts.page : 'dist/index.html';
  const writer = projectWriter(invocationFromActivation(opts, 'omd studio look'));
  const { lookAtBuild } = await import('../../core/design/studio-look.ts');
  const look = await lookAtBuild(process.cwd(), writer, page);
  await out(opts, look, [`round ${look.round}: ${look.files.length} captures in ${look.dir}`,
    ...(look.beside.length === 0 ? [] : [`beside ${look.reference}: ${look.beside.join(', ')}`])].join('\n'));
  process.exit(0);
}

async function cmdStudioBlueprint(opts: Opts): Promise<never> {
  const writer = projectWriter(invocationFromActivation(opts, 'omd studio blueprint'));
  const { writeBlueprint } = await import('../../core/design/studio-look.ts');
  const result = writeBlueprint(process.cwd(), writer, opts._[0] === undefined ? undefined : String(opts._[0]));
  await out(opts, result, `${result.path}: the skeleton of ${result.reference} (${result.sections} sections), with no copy, colour or image`);
  process.exit(0);
}

async function cmdStudioBaseline(opts: Opts): Promise<never> {
  const urls = opts._.map(String);
  if (urls.length === 0) throw new Error('usage: omd studio baseline <url> [<url> ...] [--json]   (every existing screen the work touches)');
  const writer = projectWriter(invocationFromActivation(opts, 'omd studio baseline'));
  const { captureBaseline, STUDIO_BASELINE_DIR, STUDIO_LEDGER_GUIDANCE } = await import('../../core/design/studio-screens.ts');
  const screens = await captureBaseline(writer, urls);
  await out(opts, { screens, next: STUDIO_LEDGER_GUIDANCE }, [...screens.map(screen => `${STUDIO_BASELINE_DIR}/${screen.name}: ${screen.controls.length} controls, ${screen.routes.length} routes`), STUDIO_LEDGER_GUIDANCE].join('\n'));
  process.exit(0);
}

async function cmdStudioRig(opts: Opts): Promise<never> {
  const writer = projectWriter(invocationFromActivation(opts, 'omd studio rig'));
  const { installMaterialRig } = await import('../../core/design/material-rig.ts');
  const result = installMaterialRig(process.cwd(), writer, typeof opts.out === 'string' ? opts.out : 'src/stage');
  await out(opts, result, `${result.files.join(', ')}\n${result.next}`);
  process.exit(0);
}

export async function runStudio(args: string[]): Promise<never> {
  const sub = args[1];
  if (args.includes('--help')) {
    console.log('omd studio refs <url> [<url> ...] [--json]   study finished sites: first screen, whole page, section crops and their measured system\n'
      + 'omd studio blueprint [<url>] [--json]   the primary reference\'s skeleton (section order, heights, what leads each) with no copy, colour or image\n'
      + 'omd studio rig [--out src/stage] [--json]   install the material stage: a lit, tone-mapped three.js rig that turns the mark\'s SVG path into a glass, clay, porcelain or ink-metal object\n'
      + 'omd studio look [--page <file|url>] [--json]   shoot the build screen by screen at desktop and phone width and set it beside the primary reference\n'
      + 'omd studio check [--page <file|url>] [--json]   marketing page: the system it promised, defects (fail) and default conventions (overridable by a recorded deviation)\n'
      + 'omd studio check --mode product <screen> <screen> [...]   every screen against the system file: one role, one build\n'
      + 'omd studio baseline <url> [<url> ...]   redesign: capture every existing screen, its controls and routes, before changing it\n'
      + 'omd studio check --mode redesign [--origin <url>]   old beside new for every baseline screen; a lost control or route fails unless .omd/studio/ledger.json records the change');
    process.exit(0);
  }
  if (sub === 'refs') return cmdStudioRefs(parseArgs(args.slice(2)));
  if (sub === 'check') return cmdStudioCheck(parseArgs(args.slice(2)));
  if (sub === 'look') return cmdStudioLook(parseArgs(args.slice(2)));
  if (sub === 'blueprint') return cmdStudioBlueprint(parseArgs(args.slice(2)));
  if (sub === 'baseline') return cmdStudioBaseline(parseArgs(args.slice(2)));
  if (sub === 'rig') return cmdStudioRig(parseArgs(args.slice(2)));
  throw new Error(`unknown command studio${sub ? ` ${sub}` : ''}; run omd help`);
}
