import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import omdExtension, { type PortablePiEvent, type PortablePiHook, type PortablePiTool } from '../../extensions/omd.ts';

const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Finished.' }] };
export const isBlocked = (value: unknown): boolean => typeof value === 'object' && value !== null && 'block' in value && value.block === true;
type Event = PortablePiEvent & { toolCallId?: string; isError?: boolean };

export function harness(t: { after(fn: () => void): void }, routed = true) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-pi-continuity-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
  if (routed) writeFileSync(join(cwd, '.omd/route.json'), '{}');
  const hooks = new Map<string, PortablePiHook>();
  const commands: string[][] = [];
  const sent: string[] = [];
  const blockedStages = new Set<string>();
  const unselected = new Set<string>();
  let tool: PortablePiTool | undefined;
  let publicationFails = false;
  let nextStage: string | null = 'reference-board';
  let sequence = 0;
  omdExtension({
    on: (name, hook) => { hooks.set(name, hook); },
    registerCommand() {}, registerTool: value => { tool = value; },
    sendMessage: value => { sent.push(value.customType); },
    async exec(_command, argv) {
      const args = argv.slice(1); commands.push([...args]);
      const stage = args[1] ?? '';
      if (args[0] === 'route' && args[1] === 'classify' && !publicationFails) writeFileSync(join(cwd, '.omd/route.json'), '{}');
      if (args[0] === 'brief') {
        const blockers = blockedStages.has(stage) ? ['upstream reference-board: missing application evidence'] : [];
        const selected = !unselected.has(stage);
        return { stdout: JSON.stringify({ stage, entryGate: { selected }, blockers }), stderr: '',
          code: args.includes('--check') && (blockers.length > 0 || !selected) ? 1 : 0, killed: false };
      }
      if (args[0] === 'stage') return { stdout: JSON.stringify({ schema: 'stage-next-v1', stage: nextStage,
        owner: nextStage === null ? null : 'omd-scout', action: 'repair-output', progress: { routeSha256: 'a'.repeat(64), validatedStages: ['domain', 'frame'] } }), stderr: '', code: 0, killed: false };
      if (args[0] === 'guard') return { stdout: JSON.stringify({ blockers: ['reference research/application missing'] }), stderr: '', code: 1, killed: false };
      return { stdout: '{}', stderr: publicationFails ? 'publisher failed' : '', code: publicationFails ? 1 : 0, killed: false };
    },
  });
  async function emit(name: string, event: Event) { return hooks.get(name)?.(event, { cwd }); }
  async function run(args: string[]) {
    assert.ok(tool);
    await emit('tool_call', { toolName: 'omd_cli', input: { args } });
    return tool.execute('cli', { args }, undefined, undefined, { cwd });
  }
  async function write(path: string, failed = false) {
    const toolCallId = `native-${++sequence}`;
    const event = { toolName: 'write', toolCallId, input: { path, content: 'new owner output' } };
    const refusal = await emit('tool_call', event);
    if (isBlocked(refusal)) return refusal;
    if (!failed) { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), 'new owner output'); }
    await emit('tool_result', { ...event, isError: failed });
    return refusal;
  }
  return { cwd, commands, sent, blockedStages, unselected, emit, run, write,
    activate: (prompt = '/skill:omd-ultradesign') => emit('before_agent_start', { prompt }),
    end: () => emit('message_end', { message: final }),
    failPublication: () => { publicationFails = true; },
    noNextStage: () => { nextStage = null; } };
}

export function expandedSkillOnly(): string {
  const path = fileURLToPath(new URL('../../src/skills/omd-ultradesign/SKILL.md', import.meta.url));
  const content = readFileSync(path, 'utf8');
  const delimiter = content.indexOf('\n---', 3);
  const body = content.slice(delimiter + 4).trim();
  return `<skill name="omd-ultradesign" location="${path}">\nReferences are relative to ${dirname(path)}.\n\n${body}\n</skill>`;
}
