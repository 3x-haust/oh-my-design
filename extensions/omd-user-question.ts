import { createHash } from 'node:crypto';

export type UserQuestion = Readonly<{ digest: string; question: string; options: readonly string[]; kind: string }>;
const browserOptions = ['평소 쓰는 브라우저 그대로 쓰기', 'OMD 전용 로그인 브라우저', '이번엔 건너뛰기', '다시 묻지 않기'];

export function parseUserQuestion(text: string): UserQuestion | null {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^OMD_CLI_FAILED \([^)]*\):\s*/, '')); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const referenceWork = Reflect.get(value, 'referenceWork');
  const action = referenceWork && typeof referenceWork === 'object' && Reflect.get(referenceWork, 'action')
    ? Reflect.get(referenceWork, 'action') : Reflect.get(value, 'action');
  if (!action || typeof action !== 'object') return null;
  const kind = Reflect.get(action, 'kind');
  const question = Reflect.get(action, 'question') ?? Reflect.get(value, 'question');
  const awaitsUser = Reflect.get(action, 'awaitsUser') === true || Reflect.get(value, 'awaitsUser') === true || kind === 'browser-consent';
  const rawOptions = Reflect.get(action, 'options') ?? Reflect.get(value, 'options');
  const answers = Reflect.get(action, 'answers');
  const options = Array.isArray(rawOptions) ? rawOptions : answers && typeof answers === 'object' ? Object.keys(answers) : kind === 'browser-consent' ? browserOptions : [];
  if (!awaitsUser || typeof question !== 'string' || !question.trim() || !Array.isArray(options)
    || !options.length || !options.every((option): option is string => typeof option === 'string' && !!option.trim())) return null;
  const digest = createHash('sha256').update(JSON.stringify([kind, question, options, (referenceWork && typeof referenceWork === 'object' ? Reflect.get(referenceWork, 'workSha256') : Reflect.get(value, 'workSha256')) ?? null])).digest('hex');
  return { digest, question, options, kind: typeof kind === 'string' ? kind : 'user-decision' };
}

export function questionText(question: UserQuestion): string {
  const choices = `${question.question}\n${question.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`;
  return question.kind === 'browser-consent'
    ? `${choices}\nFor a free-text reply, interpret the user's meaning yourself. Run omd browser setup --engine user-browser|omd-profile --consent --user-answer "<exact user text>", or omd browser skip --decision skipped-this-run|never-ask --user-answer "<exact user text>". Only an interactive or rpc answer received after this question is eligible.`
    : choices;
}

export function browserAnswer(question: UserQuestion, selected: string): 'user-browser' | 'omd-profile' | 'skipped-this-run' | 'never-ask' | null {
  if (question.kind !== 'browser-consent' || !question.options.includes(selected)) return null;
  const index = browserOptions.indexOf(selected);
  return (['user-browser', 'omd-profile', 'skipped-this-run', 'never-ask'] as const)[index] ?? null;
}
