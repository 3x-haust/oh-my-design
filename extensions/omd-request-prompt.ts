import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVerifiedJudgment, type VerifiedJudgment } from '../core/judgment/index.ts';

const SKILL_PATH = fileURLToPath(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url));
export type OmdWorkflowPrompt = Readonly<{ kind: 'skill-only' }> | Readonly<{ kind: 'full-build'; request: string }>;

export function normalizeOmdAlias(text: string): string | undefined {
  const alias = '/ultradesign';
  if (!/^\/ultradesign(?:\s|$)/u.test(text)) return undefined;
  const command = '/skill:omd-ultradesign';
  return text.length === alias.length ? command : `${command} ${text.slice(alias.length + 1)}`;
}

/** Extract only the host's exact skill-argument bytes; this does not classify user intent. */
export function extractOmdWorkflowRequest(prompt: string): string | null | undefined {
  const request = prompt.trimStart();
  if (/^(?:\/skill:|\$)?omd-ultradesign$/i.test(request.trimEnd())) return null;
  const direct = /^(?:\/skill:|\$)omd-ultradesign\s([\s\S]*)$/i.exec(request);
  if (direct !== null) return direct[1] ?? '';
  const header = `<skill name="omd-ultradesign" location="${SKILL_PATH}">`;
  const instructionHeader = `<skill-instruction name="omd-ultradesign" location="${SKILL_PATH}">`;
  if (!request.startsWith(`${header}\n`) && !request.startsWith('The user explicitly invoked the "omd-ultradesign" skill.')) return undefined;
  try {
    const source = readFileSync(SKILL_PATH, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const delimiter = source.startsWith('---') ? source.indexOf('\n---', 3) : -1;
    const body = (delimiter < 0 ? source : source.slice(delimiter + 4)).trim();
    const expansion = `${header}\nReferences are relative to ${dirname(SKILL_PATH)}.\n\n${body}\n</skill>`;
    if (request.trimEnd() === expansion) return null;
    const prefix = `${expansion}\n\n`;
    if (request.startsWith(prefix)) return request.slice(prefix.length);
    const instruction = `The user explicitly invoked the "omd-ultradesign" skill. Follow the instructions in <skill-instruction> as binding for this request, while respecting higher-priority instructions.\n\n${instructionHeader}\nReferences are relative to ${dirname(SKILL_PATH)}.\n\n${body}\n</skill-instruction>`;
    if (request === instruction) return null;
    const requestPrefix = `${instruction}\n\n<user-request>\n`;
    if (!request.startsWith(requestPrefix) || !request.endsWith('\n</user-request>')) return undefined;
    return request.slice(requestPrefix.length, -'\n</user-request>'.length);
  } catch (error) {
    if (error instanceof Error) return undefined;
    throw error;
  }
}

/** Intent is never inferred from words in the extracted request. */
export function parseOmdWorkflowPrompt(prompt: string, judgment?: VerifiedJudgment): OmdWorkflowPrompt | null {
  const request = extractOmdWorkflowRequest(prompt);
  if (request === null) return { kind: 'skill-only' };
  if (request === undefined || !isVerifiedJudgment(judgment) || judgment.judgment.purpose !== 'workflow-intent'
    || judgment.judgment.decision !== 'implement'
    || !judgment.sources.some(source => source.text === prompt || source.text === request)) return null;
  return { kind: 'full-build', request };
}
