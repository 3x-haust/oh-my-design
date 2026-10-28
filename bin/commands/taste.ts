import { invocationFromActivation, parseArgs, type Opts } from '../cli/runtime.ts';

async function cmdTasteCompare(opts: Opts): Promise<never> {
  const anchors = opts.anchor === undefined ? [] : [opts.anchor].flat().map(String);
  const { runTasteComparison } = await import('../../core/design/taste-comparison.ts');
  const compared = await runTasteComparison(process.cwd(), invocationFromActivation(opts, 'omd taste compare'), { anchors });
  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(compared), () => done()));
  else {
    const { summary } = compared;
    console.log(`taste comparison: ${summary.verdict} — judged AI in ${summary.judgedAi}/${summary.trials} trials (${Math.round(summary.rate * 100)}%)`);
    console.log(`  anchors: ${compared.anchors.used.join(', ')}`);
    for (const skipped of compared.anchors.skipped) console.log(`  skipped ${skipped.url}: ${skipped.reason}`);
    for (const viewport of ['desktop', 'mobile'] as const) {
      for (const tell of summary.recurringTells[viewport]) console.log(`  [${viewport}] ${tell}`);
    }
    console.log(`  record: ${compared.path}`);
    console.log(`next: ${compared.next}`);
  }
  // Advisory: a distinguishable verdict is a repair signal, not a failed command.
  process.exit(0);
}

async function cmdTasteGraphic(opts: Opts): Promise<never> {
  if (opts.skip !== undefined) {
    const { recordGraphicSkip } = await import('../../core/design/taste-graphic-decision.ts');
    const skipped = await recordGraphicSkip(process.cwd(), invocationFromActivation(opts, 'omd taste graphic'), String(opts.skip));
    if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(skipped), () => done()));
    else console.log(`graphic skipped: ${skipped.reason}\n  record: ${skipped.path}`);
    process.exit(0);
  }
  const graphic = opts._[0] ?? (() => { throw new Error('usage: omd taste graphic <rendered.png> --against <kept image.path> [--against ...] [--json]'); })();
  const against = opts.against === undefined ? [] : [opts.against].flat().map(String);
  const { runTasteGraphic } = await import('../../core/design/taste-graphic.ts');
  const compared = await runTasteGraphic(process.cwd(), invocationFromActivation(opts, 'omd taste graphic'), { graphic, against });
  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(compared), () => done()));
  else {
    const { summary } = compared;
    console.log(`graphic comparison: ${summary.verdict} — judged AI in ${summary.judgedAi}/${summary.trials} trials (${Math.round(summary.rate * 100)}%)`);
    for (const tell of summary.recurringTells) console.log(`  ${tell}`);
    console.log(`  record: ${compared.path}`);
    console.log(`next: ${compared.next}`);
  }
  process.exit(0);
}

function unknown(command: string, sub?: string): never {
  throw new Error(`unknown command ${command}${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runTaste(args: string[]): Promise<never> {
  const command = args[0]!;
  const sub = args[1];
  if (args.includes('--help')) {
    console.log('omd taste compare [--anchor <url> ...] [--json]\nomd taste graphic <rendered.png> --against <kept image.path> [--against ...] [--json]\nomd taste graphic --skip "<why this page carries no graphic>"');
    process.exit(0);
  }
  if (sub === 'compare') return cmdTasteCompare(parseArgs(args.slice(2)));
  if (sub === 'graphic') return cmdTasteGraphic(parseArgs(args.slice(2)));
  return unknown(command, sub);
}
