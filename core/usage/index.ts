import { homedir } from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Run usage: wall-clock time + token totals for the current design run.
 *
 * OMD runs inside a host agent (Claude Code or Codex). Neither exposes a token
 * meter to a skill directly, but both persist per-turn usage to a local session
 * log. This module reads that log for the current working directory and sums it.
 * The parsers are pure (they take the log lines); only the discovery layer
 * touches the filesystem, so the summation is unit-tested against real fixtures.
 */
export interface RunUsage {
  host: 'claude' | 'codex';
  /** Total tokens processed (input + cache + output), summed across the run's threads. */
  totalTokens: number;
  /** Output (generated) tokens only. */
  outputTokens: number;
  /** Wall-clock milliseconds from first to last logged event. */
  elapsedMs: number;
  /** Tool invocations, when the log records them. */
  toolUses: number;
  /** True when the figure is known to be partial (e.g. Codex subagent rollouts not found). */
  approximate: boolean;
  /** Human note about scope/source. */
  note: string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

function parseTs(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const t = Date.parse(c);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

// ── Claude Code session transcript (one JSON object per line) ───────────────────
//
// Assistant `usage` repeats on every content-block line of the SAME message, so
// tokens are deduped by message id. Tool-use blocks are deduped by their own id.
// A subagent's total is surfaced to the parent as a `<usage>subagent_tokens: N
// tool_uses: N duration_ms: N</usage>` block inside a tool_result — its tokens are
// NOT in the parent's per-message usage, so they are added, not double-counted.
export function parseClaudeSession(lines: string[]): RunUsage | null {
  const byMsg = new Map<string, { total: number; output: number }>();
  const toolIds = new Set<string>();
  let first = Infinity;
  let last = -Infinity;
  let anyEvent = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = obj as Record<string, any>;
    anyEvent = true;
    const ts = parseTs(rec.timestamp, rec?.message?.timestamp);
    if (Number.isFinite(ts)) {
      if (ts < first) first = ts;
      if (ts > last) last = ts;
    }
    const msg = rec.message;
    const usage = msg?.usage;
    if (msg?.id && usage && typeof usage === 'object') {
      const total = num(usage.input_tokens) + num(usage.cache_creation_input_tokens)
        + num(usage.cache_read_input_tokens) + num(usage.output_tokens);
      byMsg.set(msg.id, { total, output: num(usage.output_tokens) });
    }
    const content = msg?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'tool_use' && typeof block.id === 'string') toolIds.add(block.id);
      }
    }
  }

  if (!anyEvent) return null;

  let totalTokens = 0;
  let outputTokens = 0;
  for (const v of byMsg.values()) {
    totalTokens += v.total;
    outputTokens += v.output;
  }
  let toolUses = toolIds.size;

  // Subagent completion summaries live in tool_result text; dedup identical blocks.
  const joined = lines.join('\n');
  const subUsage = new Set<string>();
  for (const m of joined.matchAll(/subagent_tokens:\s*(\d+)\s*(?:\\n|\s)+tool_uses:\s*(\d+)\s*(?:\\n|\s)+duration_ms:\s*(\d+)/g)) {
    const key = `${m[1]}:${m[2]}:${m[3]}`;
    if (subUsage.has(key)) continue;
    subUsage.add(key);
    totalTokens += Number(m[1]);
    toolUses += Number(m[2]);
  }

  const elapsedMs = Number.isFinite(first) && Number.isFinite(last) && last > first ? last - first : 0;
  return {
    host: 'claude',
    totalTokens,
    outputTokens,
    elapsedMs,
    toolUses,
    approximate: false,
    note: subUsage.size > 0 ? 'claude 세션 로그 (서브에이전트 포함)' : 'claude 세션 로그',
  };
}

// ── Codex rollout (one JSON object per line) ────────────────────────────────────
//
// Each `token_count` event carries a per-thread cumulative
// `total_token_usage.total_tokens`; the last one is that thread's total. A run's
// subagents are separate rollout files parented to the main thread's session id.
export interface CodexRollout {
  cwd: string | null;
  sessionId: string | null;
  parentThreadId: string | null;
  isSubagent: boolean;
  totalTokens: number;
  outputTokens: number;
  first: number;
  last: number;
  hadTokenCount: boolean;
}

export function parseCodexRollout(lines: string[]): CodexRollout | null {
  let cwd: string | null = null;
  let sessionId: string | null = null;
  let parentThreadId: string | null = null;
  let isSubagent = false;
  let totalTokens = 0;
  let outputTokens = 0;
  let first = Infinity;
  let last = -Infinity;
  let hadTokenCount = false;
  let any = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = obj as Record<string, any>;
    any = true;
    const ts = parseTs(rec.timestamp);
    if (Number.isFinite(ts)) {
      if (ts < first) first = ts;
      if (ts > last) last = ts;
    }
    const p = rec.payload;
    if (rec.type === 'session_meta' && p) {
      cwd = p.cwd ?? cwd;
      sessionId = p.session_id ?? p.id ?? sessionId;
      parentThreadId = p.parent_thread_id
        ?? p?.source?.subagent?.thread_spawn?.parent_thread_id
        ?? parentThreadId;
      if (p.thread_source === 'subagent' || parentThreadId) isSubagent = true;
    }
    if (p?.type === 'token_count') {
      const info = p.info?.total_token_usage;
      if (info && typeof info.total_tokens === 'number') {
        totalTokens = info.total_tokens; // cumulative — last wins
        outputTokens = num(info.output_tokens);
        hadTokenCount = true;
      }
    }
  }

  if (!any) return null;
  return { cwd, sessionId, parentThreadId, isSubagent, totalTokens, outputTokens, first, last, hadTokenCount };
}

/** Combine a main Codex rollout with its subagent rollouts into one RunUsage. */
export function combineCodexRollouts(main: CodexRollout, children: CodexRollout[]): RunUsage {
  let totalTokens = main.totalTokens;
  let outputTokens = main.outputTokens;
  let first = main.first;
  let last = main.last;
  for (const c of children) {
    totalTokens += c.totalTokens;
    outputTokens += c.outputTokens;
    if (c.first < first) first = c.first;
    if (c.last > last) last = c.last;
  }
  const elapsedMs = Number.isFinite(first) && Number.isFinite(last) && last > first ? last - first : 0;
  return {
    host: 'codex',
    totalTokens,
    outputTokens,
    elapsedMs,
    toolUses: 0,
    approximate: false,
    note: children.length > 0
      ? `codex 롤아웃 (서브에이전트 ${children.length}개 포함)`
      : 'codex 롤아웃 (메인 스레드)',
  };
}

// ── Discovery (filesystem) ──────────────────────────────────────────────────────

function claudeSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

function newestFile(paths: string[]): string | null {
  let best: string | null = null;
  let bestMtime = -Infinity;
  for (const p of paths) {
    try {
      const m = statSync(p).mtimeMs;
      if (m > bestMtime) {
        bestMtime = m;
        best = p;
      }
    } catch {
      /* ignore */
    }
  }
  return best;
}

function readClaudeUsage(cwd: string, home: string): RunUsage | null {
  const dir = join(home, '.claude', 'projects', claudeSlug(cwd));
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f));
  } catch {
    return null;
  }
  const file = newestFile(entries);
  if (!file) return null;
  return parseClaudeSession(readFileSync(file, 'utf8').split('\n'));
}

function listCodexRollouts(home: string, sinceMs: number): string[] {
  const base = join(home, '.codex', 'sessions');
  const out: string[] = [];
  const walk = (dir: string): void => {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (item.startsWith('rollout-') && item.endsWith('.jsonl') && st.mtimeMs >= sinceMs) out.push(full);
    }
  };
  walk(base);
  return out;
}

function readCodexUsage(cwd: string, home: string): RunUsage | null {
  // Bound the scan to recent rollouts to avoid reading the whole archive.
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const files = listCodexRollouts(home, sinceMs);
  if (files.length === 0) return null;

  const parsed: Array<{ file: string; mtime: number; roll: CodexRollout }> = [];
  for (const file of files) {
    let roll: CodexRollout | null;
    try {
      roll = parseCodexRollout(readFileSync(file, 'utf8').split('\n'));
    } catch {
      continue;
    }
    if (!roll || roll.cwd !== cwd) continue;
    parsed.push({ file, mtime: statSync(file).mtimeMs, roll });
  }
  if (parsed.length === 0) return null;

  // Main = newest non-subagent rollout for this cwd; else newest of any.
  parsed.sort((a, b) => b.mtime - a.mtime);
  const mainEntry = parsed.find((p) => !p.roll.isSubagent) ?? parsed[0]!;
  const main = mainEntry.roll;
  const rootId = main.sessionId;
  const children = parsed
    .filter((p) => p !== mainEntry && rootId && p.roll.parentThreadId === rootId)
    .map((p) => p.roll);
  return combineCodexRollouts(main, children);
}

/**
 * Compute usage for the current run from the host session log. Returns null when
 * no readable host log is found (e.g. an unknown host or a fresh worktree with no
 * session yet) — callers fall back to a time-only or "unavailable" report.
 */
export function computeRunUsage(cwd: string, home: string = homedir()): RunUsage | null {
  return readClaudeUsage(cwd, home) ?? readCodexUsage(cwd, home);
}

// ── Formatting ──────────────────────────────────────────────────────────────────

export function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}분 ${rem}초` : `${m}분`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}시간 ${mm}분` : `${h}시간`;
}

export function formatRunUsage(u: RunUsage): string {
  const n = (x: number): string => x.toLocaleString('en-US');
  const lines = [
    '## 실행 사용량 (이 세션)',
    `- 소요 시간: ${formatElapsed(u.elapsedMs)}`,
    `- 토큰: 총 ${n(u.totalTokens)}${u.outputTokens ? ` (출력 ${n(u.outputTokens)})` : ''}${u.approximate ? ' (근사)' : ''}`,
  ];
  if (u.toolUses > 0) lines.push(`- 도구 호출: ${n(u.toolUses)}회`);
  lines.push(`- 출처: ${u.note}`);
  return lines.join('\n');
}
