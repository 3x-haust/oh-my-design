import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_PATH = fileURLToPath(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url));

export type OmdWorkflowPrompt = Readonly<{ kind: 'skill-only' }>
  | Readonly<{ kind: 'full-build'; request: string }>;

export function normalizeOmdAlias(text: string): string | undefined {
  const alias = '/ultradesign';
  if (!/^\/ultradesign(?:\s|$)/u.test(text)) return undefined;
  const command = '/skill:omd-ultradesign';
  return text.length === alias.length ? command : `${command} ${text.slice(alias.length + 1)}`;
}

function withoutFencedCode(request: string): string {
  let fence: { marker: string; length: number } | null = null;
  return request.split(/\r?\n/).flatMap(raw => {
    const delimiter = /^(\x60{3,}|~{3,})(.*)$/u.exec(raw.trim());
    const markers = delimiter?.[1];
    const suffix = delimiter?.[2];
    const marker = markers?.[0];
    if (fence) {
      if (marker === fence.marker && markers !== undefined
        && markers.length >= fence.length && suffix?.trim() === '') fence = null;
      return [];
    }
    if (marker !== undefined && markers !== undefined && suffix !== undefined
      && (marker === '~' || !suffix.includes('\x60'))) {
      fence = { marker, length: markers.length };
      return [];
    }
    return [raw];
  }).join('\n');
}

function withoutInlineCode(request: string, quotedInstruction: RegExp): string {
  const runs = [...request.matchAll(/\x60+/gu)];
  let result = '';
  let cursor = 0;
  for (const [index, opening] of runs.entries()) {
    if (opening.index < cursor) continue;
    const closing = runs.find((run, candidate) => candidate > index && run[0].length === opening[0].length);
    result += request.slice(cursor, opening.index);
    if (closing === undefined) return result + request.slice(opening.index);
    const contents = request.slice(opening.index + opening[0].length, closing.index);
    if (!quotedInstruction.test(contents)) result += contents;
    cursor = closing.index + closing[0].length;
  }
  return result + request.slice(cursor);
}

function fullBuildRequest(request: string): boolean {
  const quotedInstruction = /구현|개발|제작|완성|빌드|만들|(?:레퍼런스|참고|리서치|조사).{0,18}(?:만|까지만)|\b(?:build|implement|develop|create|research only|inspect only|stop after|do not continue|do not implement|do not build|don't build|never build|(?:only|just)\s+(?:inspect|research|review|analyze))\b/iu;
  const lines = withoutInlineCode(withoutFencedCode(request), quotedInstruction).split(/\r?\n/).flatMap(raw => {
    const line = raw.trim();
    if (!line || /^(?:>|\|)/u.test(line) || /^(?:예시|인용|example|quote)\s*[:：]/iu.test(line)) return [];
    return [line.replace(/^[-*]\s+/u, '')
      .replace(/"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」/gu,
        quoted => quotedInstruction.test(quoted) ? '' : quoted.slice(1, -1))];
  });
  if (/(?:구현|개발|제작|코딩).{0,18}하지\s*(?:마|말)|\b(?:stop after|do not continue|do not implement|do not build|don't build|never build)\b/iu.test(lines.join('\n'))) return false;
  let decision: boolean | null = null;
  for (const line of lines) {
    const matches = [
      ...[...line.matchAll(/(?:레퍼런스|참고|리서치|조사|검사|확인|보고|분석).{0,18}(?:만|까지만).{0,18}(?:해\s*줘|해\s*주세요|하자|진행)|\b(?:research only|inspect only)\b|\b(?:only|just)\s+(?:inspect|research|review|analyze)\b/giu)]
        .map(match => ({ index: match.index, build: false })),
      ...[...line.matchAll(/(?:서비스|제품|앱|리액트|React|랜딩(?:페이지)?|웹사이트|화면|대시보드).{0,80}?(?:(?:구현|개발|제작|완성|빌드)\s*(?:해\s*(?:줘|주세요|줘요)|하세요|해라|부탁(?:해요|드립니다)?)|만들(?:어\s*(?:줘|주세요|줘요)|어라|세요))|\b(?:build|implement|develop|create)\b.{0,120}\b(?:app|product|service|website|landing page|dashboard)\b/giu)]
        .map(match => ({ index: match.index, build: true })),
    ].sort((a, b) => a.index - b.index);
    for (const match of matches) decision = match.build;
  }
  return decision === true;
}

export function parseOmdWorkflowPrompt(prompt: string): OmdWorkflowPrompt | null {
  const request = prompt.trimStart();
  if (/^(?:\/skill:|\$)?omd-ultradesign$/i.test(request.trimEnd())) return { kind: 'skill-only' };
  const direct = /^(?:\/skill:|\$)omd-ultradesign\s([\s\S]*)$/i.exec(request);
  if (direct !== null) {
    const body = direct[1] ?? '';
    return fullBuildRequest(body) ? { kind: 'full-build', request: body } : null;
  }
  const header = `<skill name="omd-ultradesign" location="${SKILL_PATH}">`;
  if (!request.startsWith(`${header}\n`)) return null;
  try {
    const source = readFileSync(SKILL_PATH, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const delimiter = source.startsWith('---') ? source.indexOf('\n---', 3) : -1;
    const body = (delimiter < 0 ? source : source.slice(delimiter + 4)).trim();
    const expansion = `${header}\nReferences are relative to ${dirname(SKILL_PATH)}.\n\n${body}\n</skill>`;
    if (request.trimEnd() === expansion) return { kind: 'skill-only' };
    const prefix = `${expansion}\n\n`;
    if (!request.startsWith(prefix)) return null;
    const userRequest = request.slice(prefix.length);
    return fullBuildRequest(userRequest) ? { kind: 'full-build', request: userRequest } : null;
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}
