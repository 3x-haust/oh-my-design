import type { PortablePiEvent } from './omd-runtime.ts';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_PATH = fileURLToPath(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url));

function persistedRouteGrant(prompt: string): boolean {
  const request = prompt.trim();
  if (/^(?:\/skill:|\$)?omd-ultradesign$/i.test(request)) return true;
  const header = `<skill name="omd-ultradesign" location="${SKILL_PATH}">`;
  if (!request.startsWith(`${header}\n`)) return false;
  try {
    const source = readFileSync(SKILL_PATH, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const delimiter = source.startsWith('---') ? source.indexOf('\n---', 3) : -1;
    const body = (delimiter < 0 ? source : source.slice(delimiter + 4)).trim();
    return request === `${header}\nReferences are relative to ${dirname(SKILL_PATH)}.\n\n${body}\n</skill>`;
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}

const NATIVE_STAGES: Readonly<Record<string, string>> = {
  '.omd/domain-brief.json': 'domain', '.omd/scout.md': 'scout', '.omd/copy-deck.md': 'copy',
  '.omd/type-proof.md': 'type-proof', '.omd/composition.md': 'composition',
};
const PUBLISHER_STAGES: Readonly<Record<string, string>> = {
  'frame set': 'frame', 'ref board': 'reference-board',
  'ref research-set': 'reference-board', 'ref apply-set': 'reference-board',
  'grain set': 'content-grain', 'acquisition set': 'acquisition', 'candidate select': 'candidate-generation',
};

export const nativeOwnedStage = (path: string): string | undefined => NATIVE_STAGES[path];
export const nativeEntryStage = (path: string): string | undefined => path === '.omd/domain-brief.json' ? undefined : nativeOwnedStage(path);

type NativeWork = Readonly<{ stage: string; tool: string; path: string }>;
type WorkflowTask = {
  readonly token: symbol;
  readonly resumeGranted: boolean;
  readonly checked: Set<string>;
  readonly pending: Map<string, NativeWork>;
  started: boolean;
};

export class StageWork {
  private readonly tasks = new Map<string, WorkflowTask>();
  clear(): void { this.tasks.clear(); }
  delete(cwd: string): void { this.tasks.delete(cwd); }
  activate(cwd: string, prompt: string): void {
    if (!/(?:^|\s)(?:\/skill:|\$)?omd-ultradesign(?:\s|$)|<skill\s+name=["']omd-ultradesign["']/i.test(prompt) || this.tasks.has(cwd)) return;
    this.tasks.set(cwd, { token: Symbol(), resumeGranted: persistedRouteGrant(prompt), checked: new Set(), pending: new Map(), started: false });
  }
  token(cwd: string): symbol | undefined { return this.tasks.get(cwd)?.token; }
  started(cwd: string): boolean { const task = this.tasks.get(cwd); return task !== undefined && task.resumeGranted && task.started; }
  checked(cwd: string, stage: string): void { this.tasks.get(cwd)?.checked.add(stage); }
  unselected(cwd: string, stage: string): void { this.tasks.get(cwd)?.checked.delete(stage); }
  commandSucceeded(cwd: string, command: Readonly<{ args: readonly string[]; token: symbol | undefined }>): boolean {
    const task = this.tasks.get(cwd);
    if (!task || task.token !== command.token) return false;
    const { args } = command;
    if (args.includes('--help') || args.includes('-h')) return false;
    if (args[0] === 'route' && args[1] === 'classify') { task.checked.clear(); task.pending.clear(); task.started = false; }
    if (args[0] === 'brief' && args[1] !== undefined && args.includes('--check')) task.checked.add(args[1]);
    const stage = PUBLISHER_STAGES[`${args[0]} ${args[1]}`];
    if (stage === undefined || !task.checked.has(stage)) return false;
    task.started = true;
    return true;
  }
  nativeStarted(cwd: string, event: PortablePiEvent, stage: string): void {
    const task = this.tasks.get(cwd);
    const path = event.input?.path;
    if (!task?.checked.has(stage) || !event.toolCallId || !event.toolName || typeof path !== 'string') return;
    task.pending.set(event.toolCallId, { stage, tool: event.toolName, path });
  }
  nativeFinished(cwd: string, event: PortablePiEvent): void {
    const task = this.tasks.get(cwd);
    if (!task || !event.toolCallId) return;
    const work = task.pending.get(event.toolCallId);
    task.pending.delete(event.toolCallId);
    if (work && event.isError === false && event.toolName === work.tool && event.input?.path === work.path) task.started = true;
  }
}

function selectedBrief(text: string): boolean | undefined {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^OMD_CLI_FAILED \([^)]*\):\s*/, '')); }
  catch { return undefined; }
  if (typeof value !== 'object' || value === null || !('entryGate' in value)
    || typeof value.entryGate !== 'object' || value.entryGate === null || !('selected' in value.entryGate)) return undefined;
  return typeof value.entryGate.selected === 'boolean' ? value.entryGate.selected : undefined;
}

export async function checkNativeStageEntry(stage: string, run: (args: readonly string[]) => Promise<{ text: string }>): Promise<boolean> {
  try {
    const result = await run(['brief', stage, '--check', '--json']);
    return selectedBrief(result.text) === true;
  } catch (error) {
    if (error instanceof Error && selectedBrief(error.message) === false) return false;
    throw error;
  }
}
