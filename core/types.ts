export type Hex = string;

/** A style value paired with the token it came from. `token: null` *is* the report. */
export interface Styled {
  value: Hex | number;
  token: string | null;
  /** Set by the DOM reader: false when the browser, not the author, chose this. */
  authored?: boolean;
  /** Set by the DOM reader: the nearest painted ancestor fill, borrowed for contrast. */
  inherited?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number }

export type LayoutMode = 'VERTICAL' | 'HORIZONTAL';

export interface Layout {
  mode: LayoutMode;
  gap: number;
  /** top, right, bottom, left */
  padding: [number, number, number, number];
}

export interface RawNode {
  id: string;
  name: string;
  type: 'FRAME' | 'TEXT';
  path: string;
  parent: string | null;
  box: Box;
  children: string[];
  layout?: Layout;
  fill?: Styled;
  radius?: Styled;
  color?: Hex;
  interactive?: boolean;
  inline?: boolean;
}

/**
 * Everything a critic would otherwise have to count. Precomputed on purpose: a language
 * model asked to measure a contrast ratio will be right most of the time, and a designer
 * only has to catch it being wrong once to stop trusting the tool.
 */
export interface Computed {
  depth: number;
  /** null at the root. Text sits on its own surface; a container is judged against its parent. */
  contrastWithParent: number | null;
  /** Element-wise mode across siblings, excluding self — an outlier cannot vote for itself. */
  siblingPaddingMode: [number, number, number, number] | null;
  tokenCoverage: number;
  hitArea: { w: number; h: number };
  isInteractive: boolean;
}

export type Node = RawNode & { computed: Computed };

export interface Stats {
  spacingHistogram: Record<string, number>;
  colorHistogram: Record<string, number>;
  orphanStyles: Hex[];
  componentReuse: Record<string, number>;
}

export interface RawIr {
  meta?: Record<string, unknown>;
  tokens?: Record<string, string>;
  nodes: RawNode[];
}

export interface Ir extends RawIr {
  nodes: Node[];
  stats: Stats;
}

export type Severity = 'error' | 'warn';

/** Layer 1 is universal and free. Layer 2 is the team's own frame. Layer 3 never lives here. */
export type Layer = 1 | 2;

export interface Rule {
  id: string;
  layer: Layer;
  severity: Severity;
  /** JS expression over `node`, `ir`. Truthy selects the node. */
  when: string;
  /** JS expression over `node`, `ir`. The quantity under test. */
  value?: string;
  /** JS expression over `node`, `ir`, `value`. Falsy raises a violation. */
  assert: string;
  message: string;
  fix?: string;
}

export type RuleValue = string | number | boolean | null | number[] | { w: number; h: number };

export interface Violation {
  id: string;
  severity: Severity;
  layer: Layer;
  nodeId: string;
  path: string;
  value: RuleValue;
  message: string;
}

export interface Frame {
  approved: boolean;
  approvedAt?: string;
  why?: string;
  generator?: string;
  body: string;
}

export type Decision = { decision: 'allow' } | { decision: 'deny'; reason: string };

export interface HookInput {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface Choice {
  ts: string;
  among: string[];
  chose: string;
  why: string | null;
  generator: string | null;
}

// ── adapters ──

export type Host = 'codex' | 'claude';

export interface AbstractHook {
  id: string;
  event: string;
  matcher: string;
  command: string;
  timeout: number;
  statusMessage: string;
  codexFileName: string;
}

export interface AbstractAgent {
  name: string;
  description: string;
  reasoning: string;
  model: string;
  allow?: string[];
  deny?: string[];
  instructions: string;
}

export interface HookCommand {
  type: 'command';
  command: string;
  timeout: number;
  statusMessage?: string;
}

export interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

/** What a host actually loads: events -> matchers -> commands. */
export interface HookFile {
  hooks: Record<string, HookEntry[]>;
}

export interface Emitted {
  files: Record<string, unknown>;
}
