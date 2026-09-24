import type { PortablePiEvent } from './omd-runtime.ts';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_PATH = fileURLToPath(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url));

function fullBuildRequest(request: string): boolean {
  const quotedBuildCommand = /(?:구현|개발|제작|완성|빌드)\s*(?:해|부탁)|만들어|\b(?:build|implement|develop|create)\b/iu;
  let fenced = false;
  const lines = request.split(/\r?\n/).flatMap(raw => {
    const line = raw.trim();
    if (/^(?:```|~~~)/u.test(line)) { fenced = !fenced; return []; }
    if (fenced || !line || /^(?:>|\|)/u.test(line) || /^(?:예시|인용|example|quote)\s*[:：]/iu.test(line)) return [];
    return [line.replace(/^[-*]\s+/u, '')
      .replace(/\x60[^\x60\n]*\x60|"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」/gu,
        quoted => quotedBuildCommand.test(quoted) ? '' : quoted.slice(1, -1))];
  });
  if (/(?:구현|개발|제작|코딩).{0,18}하지\s*(?:마|말)|\b(?:stop after|do not continue|do not implement|do not build|don't build|never build)\b|\b(?:only|just)\s+(?:inspect|research|review|analyze)\b/iu.test(lines.join('\n'))) return false;
  let decision: boolean | null = null;
  for (const line of lines) {
    const matches = [
      ...[...line.matchAll(/(?:레퍼런스|참고|리서치|조사|검사|확인|보고|분석).{0,18}(?:만|까지만).{0,18}(?:해\s*줘|해\s*주세요|하자|진행)|\b(?:research only|inspect only)\b/giu)]
        .map(match => ({ index: match.index, build: false })),
      ...[...line.matchAll(/(?:서비스|제품|앱|리액트|React|랜딩(?:페이지)?|웹사이트|화면|대시보드).{0,80}?(?:(?:구현|개발|제작|완성|빌드)\s*(?:해\s*(?:줘|주세요|줘요)|하세요|해라|부탁(?:해요|드립니다)?)|만들(?:어\s*(?:줘|주세요|줘요)|어라|세요))|\b(?:build|implement|develop|create)\b.{0,120}\b(?:app|product|service|website|landing page|dashboard)\b/giu)]
        .map(match => ({ index: match.index, build: true })),
    ].sort((a, b) => a.index - b.index);
    for (const match of matches) decision = match.build;
  }
  return decision === true;
}

function persistedRouteGrant(prompt: string): 'skill-only' | 'full-build' | null {
  const request = prompt.trim();
  if (/^(?:\/skill:|\$)?omd-ultradesign$/i.test(request)) return 'skill-only';
  const direct = /^(?:\/skill:|\$)omd-ultradesign\s+([\s\S]+)$/i.exec(request);
  if (direct !== null) return fullBuildRequest(direct[1] ?? '') ? 'full-build' : null;
  const header = `<skill name="omd-ultradesign" location="${SKILL_PATH}">`;
  if (!request.startsWith(`${header}\n`)) return null;
  try {
    const source = readFileSync(SKILL_PATH, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const delimiter = source.startsWith('---') ? source.indexOf('\n---', 3) : -1;
    const body = (delimiter < 0 ? source : source.slice(delimiter + 4)).trim();
    const expansion = `${header}\nReferences are relative to ${dirname(SKILL_PATH)}.\n\n${body}\n</skill>`;
    if (request === expansion) return 'skill-only';
    return request.startsWith(`${expansion}\n\n`) && fullBuildRequest(request.slice(expansion.length).trim()) ? 'full-build' : null;
  } catch (error) {
    if (error instanceof Error) return null;
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
  readonly entryContinues: boolean;
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
    const grant = persistedRouteGrant(prompt);
    this.tasks.set(cwd, { token: Symbol(), resumeGranted: grant !== null, entryContinues: grant === 'full-build', checked: new Set(), pending: new Map(), started: false });
  }
  token(cwd: string): symbol | undefined { return this.tasks.get(cwd)?.token; }
  started(cwd: string): boolean { const task = this.tasks.get(cwd); return task !== undefined && task.resumeGranted && (task.started || (task.entryContinues && task.checked.size > 0)); }
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
