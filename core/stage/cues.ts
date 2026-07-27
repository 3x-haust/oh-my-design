// Deterministic contract cues.
//
// Storing a rule and delivering it at the moment it binds are different things: a long run reads
// the pack once and then works for an hour without re-reading it. Cues close that gap, but only
// from inputs a machine can evaluate the same way twice — a file path, a code symbol, and typed
// fields the frame and domain brief already carry.
//
// Free-text intent is deliberately not a cue source. A trigger the agent interprets is exactly the
// discipline this module exists to replace.

import { STAGES, StageError, stageDefinition, type StageId } from './contract.ts';

export type CueSource = 'path' | 'symbol' | 'field';

export type CueRule = {
  readonly source: CueSource;
  /** Path glob (`**\/landing\/**`), exact symbol name, or `field:value` for a typed brief field. */
  readonly match: string;
  /** Pack-relative contracts this cue requires before the work continues. */
  readonly contracts: readonly string[];
  readonly reason: string;
};

export const CUE_RULES: readonly CueRule[] = Object.freeze([
  { source: 'path', match: '**/landing/**', contracts: ['theory/craft.md', 'protocol/copy-deck.md'], reason: 'a landing surface is judged on persuasion craft and copy, not component correctness' },
  { source: 'path', match: '**/dashboard/**', contracts: ['theory/ux.md'], reason: 'a dashboard is a product surface whose risk is task completion' },
  { source: 'path', match: '**/*.stories.*', contracts: ['theory/components.md'], reason: 'a story file states component states that must match the component contract' },
  { source: 'symbol', match: 'Dialog', contracts: ['theory/components.md', 'theory/ux.md'], reason: 'a dialog owns focus, escape, and return-focus behaviour' },
  { source: 'symbol', match: 'form', contracts: ['theory/ux.md'], reason: 'a form owns validation, error, and recovery states' },
  { source: 'symbol', match: 'canvas', contracts: ['theory/motion.md'], reason: 'canvas work carries motion and performance obligations' },
  { source: 'field', match: 'surface:marketing', contracts: ['theory/craft.md'], reason: 'a marketing surface must earn a signature moment' },
  { source: 'field', match: 'surface:product', contracts: ['theory/ux.md'], reason: 'a product surface is judged on task completion' },
  { source: 'field', match: 'motionDecision:one', contracts: ['theory/motion.md'], reason: 'a selected motion carries the reduced-motion and trigger contract' },
  { source: 'field', match: 'motionDecision:none', contracts: ['theory/layout.md'], reason: 'a static direction still owes a designed template departure' },
  { source: 'field', match: 'localization:multi-locale', contracts: ['protocol/locale-contract.md'], reason: 'more than one locale changes copy, layout width, and control state' },
].map((rule) => Object.freeze({ ...rule, contracts: Object.freeze(rule.contracts) })) as CueRule[]);

export type CueInput = {
  readonly paths?: readonly string[];
  readonly symbols?: readonly string[];
  /** Typed fields already validated elsewhere: `{ surface: 'marketing', motionDecision: 'none' }`. */
  readonly fields?: Readonly<Record<string, string>>;
};

export type Cue = {
  readonly rule: CueRule;
  readonly matched: string;
};

/** Minimal glob: `**` spans separators, `*` stops at one, everything else is literal. */
function globMatches(glob: string, path: string): boolean {
  const pattern = glob
    .split(/(\*\*|\*)/)
    .map((part) => (part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`).test(path);
}

export function resolveCues(input: CueInput): readonly Cue[] {
  const cues: Cue[] = [];
  for (const rule of CUE_RULES) {
    if (rule.source === 'path') {
      for (const path of input.paths ?? []) if (globMatches(rule.match, path)) cues.push({ rule, matched: path });
    } else if (rule.source === 'symbol') {
      for (const symbol of input.symbols ?? []) if (symbol === rule.match) cues.push({ rule, matched: symbol });
    } else {
      const [field, value] = rule.match.split(':');
      const actual = (input.fields ?? {})[field ?? ''];
      if (actual !== undefined && actual === value) cues.push({ rule, matched: rule.match });
    }
  }
  return cues;
}

export function cueContracts(cues: readonly Cue[]): readonly string[] {
  return [...new Set(cues.flatMap((cue) => cue.rule.contracts))].sort();
}

/**
 * Contracts a stage must hold: its own declared set plus everything the current cues add. The
 * caller delivers the union, so a cue can only ever widen the obligation.
 */
export function stageContractsWithCues(stage: StageId | string, cues: readonly Cue[]): readonly string[] {
  const definition = stageDefinition(String(stage));
  return [...new Set([...definition.requiredContracts, ...cueContracts(cues)])].sort();
}

export function validateCueRules(rules: readonly CueRule[] = CUE_RULES): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    const key = `${rule.source}:${rule.match}`;
    if (seen.has(key)) throw new StageError(`duplicate cue rule ${key}`);
    seen.add(key);
    if (rule.contracts.length === 0) throw new StageError(`cue ${key} delivers no contract`);
    if (rule.reason.trim() === '') throw new StageError(`cue ${key} has no reason`);
    if (rule.source === 'field' && rule.match.split(':').length !== 2) throw new StageError(`field cue ${key} must be field:value`);
  }
  if (STAGES.length === 0) throw new StageError('cue rules require a stage table');
}
