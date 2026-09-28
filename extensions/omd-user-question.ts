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
  return `${question.question}\n${question.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`;
}

export function browserAnswer(question: UserQuestion, text: string): 'user-browser' | 'omd-profile' | 'skipped-this-run' | 'never-ask' | null {
  if (question.kind !== 'browser-consent') return null;
  const value = text.trim().replace(/[.!。]+$/, '').trim().toLowerCase();
  const numbered = /^[1-4]$/.test(value) ? Number(value) - 1 : -1;
  const choice = numbered >= 0 ? question.options[numbered] : question.options.find(option => option.toLowerCase() === value)
    ?? (/^(?:평소 쓰는 브라우저|평소 브라우저|내 브라우저|user-browser)$/.test(value) ? browserOptions[0]
      : /^(?:omd 전용|omd 브라우저|별도 omd 프로필 세팅)$/.test(value) ? browserOptions[1]
        : /^(?:건너뛰기|나중에|아니|아니요|no)$/.test(value) ? browserOptions[2]
          : /^(?:다시 묻지 마|다시는 묻지 마|never)$/.test(value) ? browserOptions[3] : undefined);
  if (choice !== undefined && question.options.includes(choice)) {
    if (choice === browserOptions[0]) return 'user-browser';
    if (choice === browserOptions[1]) return 'omd-profile';
    if (choice === browserOptions[2]) return 'skipped-this-run';
    if (choice === browserOptions[3]) return 'never-ask';
  }
  if (/^(?:네|예|응|ㅇㅇ|ㅇㅋ|yes|y|좋아|해|해줘|세팅해|세팅하라고|설정해|지금세팅|세팅해줘|설정해줘|설정하라고)$/.test(value.replace(/\s+/g, ''))) {
    const engines = question.options.filter(option => option === browserOptions[0] || option === browserOptions[1]);
    if (engines.length === 1) return engines[0] === browserOptions[0] ? 'user-browser' : 'omd-profile';
    // A plain yes selects the first, recommended engine: the everyday browser.
    if (engines.some(option => option === browserOptions[0]) || (engines.length === 0 && question.options.length <= 2)) return 'user-browser';
  }
  return null;
}
