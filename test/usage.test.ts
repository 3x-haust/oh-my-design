import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClaudeSession,
  parseCodexRollout,
  combineCodexRollouts,
  formatElapsed,
  formatRunUsage,
} from '../core/usage/index.ts';

const jl = (obj: unknown): string => JSON.stringify(obj);

test('parseClaudeSession dedups per-message usage, adds subagent totals, counts tools', () => {
  const lines = [
    // same message id on two content-block lines — usage must count once
    jl({ timestamp: '2026-07-21T08:00:00.000Z', message: { id: 'm1', role: 'assistant', usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 50 }, content: [{ type: 'thinking' }] } }),
    jl({ timestamp: '2026-07-21T08:00:01.000Z', message: { id: 'm1', role: 'assistant', usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 50 }, content: [{ type: 'tool_use', id: 'tu1' }] } }),
    jl({ timestamp: '2026-07-21T08:00:02.000Z', message: { id: 'm2', role: 'assistant', usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, output_tokens: 30 }, content: [{ type: 'tool_use', id: 'tu2' }] } }),
    // subagent completion summary lives in a tool_result text block
    jl({ timestamp: '2026-07-21T08:01:02.000Z', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text: '<usage>subagent_tokens: 1000\ntool_uses: 5\nduration_ms: 60000</usage>' }] }] } }),
  ];
  const u = parseClaudeSession(lines);
  assert.ok(u);
  assert.equal(u.host, 'claude');
  // m1 = 152 (counted once, not twice), m2 = 132, +1000 subagent
  assert.equal(u.totalTokens, 152 + 132 + 1000);
  assert.equal(u.outputTokens, 80);
  assert.equal(u.toolUses, 2 + 5); // tu1, tu2, + 5 subagent tool_uses
  assert.equal(u.elapsedMs, 62_000); // 08:00:00 -> 08:01:02
  assert.match(u.note, /서브에이전트 포함/);
});

test('parseClaudeSession returns null with no parseable events', () => {
  assert.equal(parseClaudeSession(['', '   ']), null);
  assert.equal(parseClaudeSession(['not json']), null);
});

test('parseCodexRollout keeps the last cumulative total and thread lineage', () => {
  const main = parseCodexRollout([
    jl({ timestamp: '2026-07-19T09:00:00.000Z', type: 'session_meta', payload: { cwd: '/x', session_id: 'root', thread_source: 'main' } }),
    jl({ timestamp: '2026-07-19T09:00:01.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 500, output_tokens: 20 } } } }),
    jl({ timestamp: '2026-07-19T09:00:05.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1500, output_tokens: 60 } } } }),
  ]);
  assert.ok(main);
  assert.equal(main.cwd, '/x');
  assert.equal(main.sessionId, 'root');
  assert.equal(main.isSubagent, false);
  assert.equal(main.totalTokens, 1500); // last cumulative, not the sum of events
  assert.equal(main.outputTokens, 60);
});

test('combineCodexRollouts sums main plus subagent rollouts', () => {
  const main = parseCodexRollout([
    jl({ timestamp: '2026-07-19T09:00:00.000Z', type: 'session_meta', payload: { cwd: '/x', session_id: 'root' } }),
    jl({ timestamp: '2026-07-19T09:00:10.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1500, output_tokens: 60 } } } }),
  ]);
  const child = parseCodexRollout([
    jl({ timestamp: '2026-07-19T09:00:02.000Z', type: 'session_meta', payload: { cwd: '/x', session_id: 'child', parent_thread_id: 'root', thread_source: 'subagent' } }),
    jl({ timestamp: '2026-07-19T09:00:20.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 800, output_tokens: 40 } } } }),
  ]);
  assert.ok(main && child);
  assert.equal(child.isSubagent, true);
  assert.equal(child.parentThreadId, 'root');
  const u = combineCodexRollouts(main, [child]);
  assert.equal(u.host, 'codex');
  assert.equal(u.totalTokens, 2300);
  assert.equal(u.outputTokens, 100);
  assert.equal(u.elapsedMs, 20_000); // 09:00:00 -> 09:00:20
  assert.match(u.note, /서브에이전트 1개 포함/);
});

test('parseCodexRollout returns null on empty input', () => {
  assert.equal(parseCodexRollout(['', 'garbage']), null);
});

test('formatElapsed renders seconds, minutes, hours', () => {
  assert.equal(formatElapsed(45_000), '45초');
  assert.equal(formatElapsed(90_000), '1분 30초');
  assert.equal(formatElapsed(120_000), '2분');
  assert.equal(formatElapsed(3_600_000), '1시간');
  assert.equal(formatElapsed(3_900_000), '1시간 5분');
});

test('formatRunUsage renders a bilingual-safe usage block', () => {
  const out = formatRunUsage({ host: 'claude', totalTokens: 2_847_193, outputTokens: 128_441, elapsedMs: 1_294_000, toolUses: 216, approximate: false, note: 'claude 세션 로그 (서브에이전트 포함)' });
  assert.match(out, /실행 사용량/);
  assert.match(out, /소요 시간: 21분 34초/);
  assert.match(out, /토큰: 총 2,847,193 \(출력 128,441\)/);
  assert.match(out, /도구 호출: 216회/);
});
