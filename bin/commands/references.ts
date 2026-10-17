import { PUBLIC_REF_COMMANDS } from '../cli/public-surface.ts';
import {
  inputJson,
  invocationFromActivation,
  parseArgs,
  projectWriter,
} from '../cli/runtime.ts';

function unknown(sub: string | undefined): never {
  throw new Error(`unknown command ref${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runReferences(args: string[]): Promise<never> {
  const sub = args[1];
  if (sub === undefined
    || !PUBLIC_REF_COMMANDS.includes(sub as typeof PUBLIC_REF_COMMANDS[number])) return unknown(sub);

  if (sub === 'browse') {
    const { cmdRefBrowse } = await import('./reference-discovery.ts');
    return cmdRefBrowse(args.slice(2));
  }
  if (sub === 'tidy' && args.slice(2).some(arg => arg === '--help' || arg === '-h')) {
    console.log(
      'omd ref tidy [--apply] [--json]\n'
      + '  Preview recognized legacy search/navigation files and unqualified design records.\n'
      + '  --apply archives exact bytes and a recovery manifest in .omd/archive/references before guarded removal.\n'
      + '  Eligible design references, domain references and unknown files remain. Revalidate dependent research and boards afterward.',
    );
    process.exit(0);
  }

  const opts = parseArgs(args.slice(2));
  if (sub === 'context') {
    if (!opts.input || opts._.length) throw new Error('usage: omd ref context --input <json> --json');
    const invocation = invocationFromActivation(opts, 'omd ref context');
    const { publishConsultedReferences } = await import('../../core/design/consulted-references.ts');
    const { readPersistedRoute } = await import('../../core/route/index.ts');
    const { sha256 } = await import('../../core/ref/board-artifacts.ts');
    const input = inputJson(opts.input, 'omd ref context');
    if (typeof input !== 'object' || input === null
      || Reflect.get(input, 'requestSha256') !== sha256(readPersistedRoute(process.cwd(), invocation).request)) {
      throw new Error('CONSULTED_REFERENCES: request scope');
    }
    console.log(JSON.stringify(publishConsultedReferences(process.cwd(), input, projectWriter(invocation))));
    process.exit(0);
  }

  if (['add', 'add-batch', 'list', 'show', 'principles', 'audit', 'import-image'].includes(sub)) {
    const capture = await import('./reference-capture.ts');
    if (sub === 'add') return capture.cmdRefAdd(opts);
    if (sub === 'add-batch') return capture.cmdRefAddBatch(opts);
    if (sub === 'list') return capture.cmdRefList(opts);
    if (sub === 'show') return capture.cmdRefShow(opts);
    if (sub === 'principles') return capture.cmdRefPrinciples(opts);
    if (sub === 'audit') return capture.cmdRefAudit(opts);
    return capture.cmdRefImportImage(opts);
  }

  const discovery = await import('./reference-discovery.ts');
  if (sub === 'tidy') return discovery.cmdRefTidy(opts);
  if (sub === 'navigate') return discovery.cmdRefNavigate(opts);
  if (sub === 'control-observe') return discovery.cmdRefControlObserve(opts);
  if (sub === 'cookie-control') return discovery.cmdRefCookieControl(opts);
  if (sub === 'discover-batch') return discovery.cmdRefDiscoveryBatch(opts);
  if (sub === 'discover-plan') return discovery.cmdRefDiscoveryPlan(opts);
  if (sub === 'work-next') return discovery.cmdRefDiscoveryWork('next', opts);
  if (sub === 'advance') return discovery.cmdRefDiscoveryWork('advance', opts);
  if (sub === 'exclude') return discovery.cmdRefDiscoveryExclude(opts);
  if (sub === 'research-set') return discovery.cmdRefResearch('set', opts);
  if (sub === 'research-check') return discovery.cmdRefResearch('check', opts);
  if (sub === 'search') return discovery.cmdRefSearch(opts);
  if (sub === 'leads') return discovery.cmdRefLeads(args[2], parseArgs(args.slice(3)));
  return unknown(sub);
}
