import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readPersistedRoute } from '../../route/index.ts';
import { createProjectWriteAdapter } from '../../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../../runtime/invocation.ts';
import { publishReferenceAnalysis, readReferenceAnalysis } from '../reference-analysis.ts';
import { readWholeScreenReferenceHandoff } from '../reference-handoff.ts';
import { BROWSE_HELP, parseBrowseCommand } from './parser.ts';
import { executeBrowseCommand } from './client.ts';
import { BrowseError, browseFail } from './contract.ts';

export const BROWSE_PUBLICATION_HELP = `analysis-set --input <reference-analysis.json> [--activation <path>] [--json]
analysis-check [--activation <path>] [--json]
handoff --for composer|hand|concept|eye|glance|fidelity [--blind] [--activation <path>] [--json]
Whole screens are the reference unit. Use shot for a real app viewport, or shot --selector <img> for a full item image.
Keep the whole screen before crop; crop is an attached zoom detail, never an independent reference.
`;
export async function runBrowseCli(argv: readonly string[], root: string,
  authorize: (activation: string | null, command: string) => ProjectRunInvocation): Promise<{ result: unknown; exitCode: number }> {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0]!)) return { result: { usage: BROWSE_HELP + BROWSE_PUBLICATION_HELP }, exitCode: 0 };
  try {
    if (['analysis-set', 'analysis-check', 'handoff'].includes(argv[0] ?? '')) {
      const verb = argv[0]!, opts = new Map<string, string>();
      const allowed = ['--activation', '--json', ...(verb === 'analysis-set' ? ['--input'] : verb === 'handoff' ? ['--for', '--blind'] : [])];
      for (let i = 1; i < argv.length; i++) {
        const flag = argv[i]!; if (!allowed.includes(flag) || opts.has(flag)) browseFail('BROWSE_USAGE', 'unknown/repeated publication flag', 2);
        const value = ['--json', '--blind'].includes(flag) ? 'true' : argv[++i];
        if (!value || value.startsWith('--')) browseFail('BROWSE_USAGE', 'missing publication flag value', 2); opts.set(flag, value);
      }
      if (verb === 'analysis-set' && !opts.has('--input')) browseFail('BROWSE_USAGE', '--input required', 2);
      const role = opts.get('--for');
      if (verb === 'handoff' && !['composer', 'hand', 'concept', 'eye', 'glance', 'fidelity'].includes(role ?? '')) browseFail('BROWSE_USAGE', 'valid --for role required', 2);
      const invocation = authorize(opts.get('--activation') ?? null, `omd ref browse ${verb}`), route = readPersistedRoute(root, invocation);
      const current = { sourceContractSha256: route.sourceContractSha256, request: route.request };
      const result = verb === 'analysis-set' ? publishReferenceAnalysis(root, JSON.parse(readFileSync(resolve(root, opts.get('--input')!), 'utf8')), current, createProjectWriteAdapter(root, invocation))
        : verb === 'analysis-check' ? readReferenceAnalysis(root, current).analysis
          : readWholeScreenReferenceHandoff(root, role as 'composer' | 'hand' | 'concept' | 'eye' | 'glance' | 'fidelity', current, { blind: opts.has('--blind') });
      return { result, exitCode: 0 };
    }
    const command = parseBrowseCommand(argv);
    const invocation = authorize(command.activation, `omd ref browse ${command.action.verb}`);
    const route = readPersistedRoute(root, invocation);
    if (route.references.decision !== 'discover') browseFail('REFERENCE_DISCOVERY_NOT_SELECTED', 'route must select reference discovery', 2);
    const result = await executeBrowseCommand(root, command, route, invocation, createProjectWriteAdapter(root, invocation));
    return { result, exitCode: result.ok ? 0 : result.outcome === 'budget-exhausted' ? 3 : 1 };
  } catch (error) {
    if (!(error instanceof BrowseError)) throw error;
    return { result: { ok: false, outcome: 'refused', code: error.code, message: error.message }, exitCode: error.exitCode };
  }
}
