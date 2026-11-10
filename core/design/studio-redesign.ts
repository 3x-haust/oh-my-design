import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDIO_DIR } from './studio-paths.ts';

/** A redesign's own record, readable without the browser: the screens as they were and the keep/change ledger. */
export const STUDIO_BASELINE_DIR = `${STUDIO_DIR}/baseline`;
export const STUDIO_LEDGER = `${STUDIO_DIR}/ledger.json`;

export type BaselineScreen = Readonly<{ name: string; url: string; route: string; controls: readonly string[]; routes: readonly string[] }>;

export function baselineScreens(root: string): readonly BaselineScreen[] {
  const base = join(root, STUDIO_BASELINE_DIR);
  if (!existsSync(base)) return [];
  return readdirSync(base).sort().flatMap(name => {
    try { return [JSON.parse(readFileSync(join(base, name, 'screen.json'), 'utf8')) as BaselineScreen]; } catch { return []; }
  });
}

export type RedesignLedger = Readonly<{ keep: readonly string[]; change: readonly Readonly<{ what: string; to: string; because: string }>[] }>;

export const STUDIO_LEDGER_GUIDANCE = `Write ${STUDIO_LEDGER} before changing a screen: {"keep": ["<what the product already owns: its mark, colours, the `
  + 'names people know, routes, behaviour, data contracts>", ...], "change": [{"what": "<the control, route or element being changed or removed, in the '
  + 'words the old screen uses>", "to": "<what replaces it>", "because": "<the problem it solves for the person using it>"}, ...]}. Everything a person '
  + 'could do on the old screen stays unless it is in "change".';

export function readLedger(root: string): RedesignLedger | null {
  const path = join(root, STUDIO_LEDGER);
  if (!existsSync(path)) return null;
  const invalid = (reason: string): never => { throw Object.assign(new Error(`STUDIO_LEDGER_INVALID: ${STUDIO_LEDGER} ${reason}. ${STUDIO_LEDGER_GUIDANCE}`), { code: 'STUDIO_LEDGER_INVALID' }); };
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { return invalid('is not JSON'); }
  const keep: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'keep') : undefined;
  const change: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'change') : undefined;
  if (!Array.isArray(keep) || keep.length === 0 || keep.some(item => typeof item !== 'string')) return invalid('needs "keep": what the product already owns');
  if (!Array.isArray(change)) return invalid('needs "change": a list, empty when nothing a person does is changed');
  const text = (item: unknown, name: string) => { const field: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, name) : undefined; return typeof field === 'string' ? field.trim() : ''; };
  const changes = change.map(item => ({ what: text(item, 'what'), to: text(item, 'to'), because: text(item, 'because') }));
  if (changes.some(item => item.what.length < 2 || item.to.length < 2 || item.because.length < 12)) return invalid('needs every change as {"what", "to", "because"}');
  return { keep: keep as string[], change: changes };
}

