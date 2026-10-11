import { browseFail, type BrowseCommand, type BrowseAction, type Lane, type Mode } from './contract.ts';
import { browseUrl, cdpEndpoint, searchUrl } from './safety.ts';

export const BROWSE_HELP = `omd ref browse <verb> [--json] [--activation <path>] [--session <id>] [--expect-head <sha256>]
start --lane domain|design [--mode headless|profile|cdp] [--user-opt-in] [--headed]
      [--cdp-url <loopback-url>] [--allow-auth-origin <https-origin>]... [--allow-pricing]
      [--budget-actions 1..240] [--budget-minutes 0.5..30] [--viewport 1280x900]
goto <https-url> --reason <root-choice> [--scope target-market|global|unscoped]
     [--source-id <id> --flow-id <id>] [--ready-selector <css>]
search <provider-or-url> <query> [--query-param q] [--query-selector <css> --submit-selector <css>]
       [--scope target-market|global|unscoped] [--ready-selector <css>]
scroll [--direction down|up|left|right] [--amount <pixels>] [--selector <css>] [--ready-selector <css>]
click|similar (--selector <css>|--text <exact-text>) [--ready-selector <css>]
back [--ready-selector <css>]
shot [--selector <whole-item-image>] [--screen-id <id> --state <label>] [--assert-visible <css>]... [--assert-hidden <css>]...
crop --selector <css> [--reference <whole-screen-keep-id>] [--as <component>] [--slot <zone-id>]
keep [--source-app <name>] [--capture <whole-screen-shot-hash>] [--lane domain|design] --reason <20..500 characters>
     [--role visual-direction|component-support|task-flow] [--direction <id>]
     [--rights allowed|restricted|unknown] [--rights-notes <text>]
drop [<keep-id>] --reason <20..500 characters>
contact-sheet [--page <positive-integer>] [--columns 2|3|4]
status
end [--reason complete|budget|saturated|interrupted]
Profile/CDP require explicit opt-in AND current request consent. Authenticated pixels are private study material, not production assets.
`;
const COMMON = ['json', 'activation', 'session', 'expect-head'];
const FLAGS: Record<string, readonly string[]> = {
  start: ['lane', 'mode', 'cdp-url', 'user-opt-in', 'headed', 'allow-auth-origin', 'allow-pricing', 'budget-actions', 'budget-minutes', 'viewport'],
  goto: ['reason', 'scope', 'ready-selector', 'source-id', 'flow-id'],
  search: ['query-param', 'query-selector', 'submit-selector', 'scope', 'ready-selector'],
  scroll: ['direction', 'amount', 'selector', 'ready-selector'], click: ['selector', 'text', 'ready-selector'],
  similar: ['selector', 'text', 'ready-selector'], back: ['ready-selector'],
  shot: ['selector', 'screen-id', 'state', 'assert-visible', 'assert-hidden'], crop: ['selector', 'reference', 'as', 'slot'],
  keep: ['source-app', 'capture', 'lane', 'reason', 'role', 'direction', 'rights', 'rights-notes'], drop: ['reason'],
  'contact-sheet': ['page', 'columns'], status: [], end: ['reason'],
};
export function parseBrowseCommand(argv: readonly string[]): BrowseCommand {
  const verb = argv[0] ?? '';
  if (!Object.hasOwn(FLAGS, verb)) browseFail('BROWSE_USAGE', BROWSE_HELP, 2);
  const options = new Map<string, string[]>(), positionals: string[] = [];
  const boolean = new Set(['json', 'user-opt-in', 'headed', 'allow-pricing']);
  const repeated = new Set(['allow-auth-origin', 'assert-visible', 'assert-hidden']);
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith('--')) { positionals.push(token); continue; }
    const key = token.slice(2);
    if (![...COMMON, ...FLAGS[verb]!].includes(key) || (options.has(key) && !repeated.has(key))) browseFail('BROWSE_USAGE', `unknown or repeated --${key}`, 2);
    const value = boolean.has(key) ? 'true' : argv[++i];
    if (!value || value.startsWith('--') || value.length > 4096 || /[\u0000-\u0008]/u.test(value)) browseFail('BROWSE_USAGE', `--${key} needs one bounded value`, 2);
    options.set(key, [...options.get(key) ?? [], value]);
  }
  const get = (key: string, fallback: string | null = null): string | null => options.get(key)?.[0] ?? fallback;
  const required = (key: string): string => get(key) ?? browseFail('BROWSE_USAGE', `--${key} required`, 2);
  const choice = <T extends string>(key: string, choices: readonly T[], fallback?: T): T => {
    const value = get(key, fallback ?? null);
    return choices.includes(value as T) ? value as T : browseFail('BROWSE_USAGE', `--${key}: ${choices.join('|')}`, 2);
  };
  const number = (key: string, fallback: number, low: number, high: number, integer = true) => {
    const value = Number(get(key, String(fallback)));
    if (!Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) browseFail('BROWSE_USAGE', `invalid --${key}`, 2);
    return value;
  };
  const reason = () => { const text = required('reason').trim(); if (text.length < 20 || text.length > 500 || /[\r\n]/u.test(text)) browseFail('BROWSE_USAGE', 'reason must be one line of 20..500 characters', 2); return text; };
  const pair = (a: string, b: string) => { if (options.has(a) !== options.has(b)) browseFail('BROWSE_USAGE', `--${a} and --${b} are a pair`, 2); };
  const scope = () => choice('scope', ['target-market', 'global', 'unscoped'] as const, 'unscoped');
  const readySelector = get('ready-selector');
  const count = verb === 'goto' ? 1 : verb === 'search' ? 2 : verb === 'drop' ? positionals.length : 0;
  if (positionals.length !== count || (verb === 'drop' && count > 1)) browseFail('BROWSE_USAGE', 'ambiguous positional arguments', 2);
  let action: BrowseAction;
  switch (verb) {
    case 'start': {
      if (options.has('session') || options.has('expect-head')) browseFail('BROWSE_USAGE', 'start creates its own session/head', 2);
      const mode = choice<Mode>('mode', ['headless', 'profile', 'cdp'], 'headless');
      const lane = choice<Lane>('lane', ['domain', 'design']);
      const userOptIn = options.has('user-opt-in'), headed = options.has('headed');
      if ((mode !== 'headless' && !userOptIn) || (headed && mode !== 'profile') || (options.has('cdp-url') !== (mode === 'cdp'))
        || (mode === 'headless' && (userOptIn || options.has('allow-auth-origin') || options.has('allow-pricing')))) browseFail('BROWSE_CONSENT_REQUIRED', 'profile/cdp require explicit --user-opt-in; headed is profile-only; headless cannot authenticate', 2);
      const viewport = /^(\d+)x(\d+)$/.exec(get('viewport', '1280x900')!);
      if (!viewport || viewport.slice(1).some(n => Number(n) < 240 || Number(n) > 2560)) browseFail('BROWSE_USAGE', 'viewport dimensions must be 240..2560', 2);
      const allowAuthOrigins = (options.get('allow-auth-origin') ?? []).map(value => {
        const url = browseUrl(value); if (new URL(url).origin !== value) browseFail('BROWSE_USAGE', 'auth origin must be an exact HTTPS origin', 2); return value;
      });
      action = { verb, lane, mode, cdpUrl: mode === 'cdp' ? cdpEndpoint(required('cdp-url')) : null, userOptIn, headed,
        allowAuthOrigins: [...new Set(allowAuthOrigins)], allowPricing: options.has('allow-pricing'),
        budgetActions: number('budget-actions', 60, 1, 240), budgetMinutes: number('budget-minutes', 10, .5, 30, false),
        viewport: { width: Number(viewport[1]), height: Number(viewport[2]) } }; break;
    }
    case 'goto': pair('source-id', 'flow-id'); action = { verb, url: browseUrl(positionals[0]!), reason: required('reason'), scope: scope(), sourceId: get('source-id'), flowId: get('flow-id'), readySelector }; break;
    case 'search': {
      pair('query-selector', 'submit-selector');
      const provider = positionals[0]!, query = positionals[1]!, queryParam = get('query-param', 'q')!;
      if (!query.trim() || query.length > 500 || !/^[a-zA-Z][\w-]{0,63}$/.test(queryParam)) browseFail('BROWSE_USAGE', 'invalid search query/parameter', 2);
      searchUrl(provider, query, queryParam);
      action = { verb, provider, query, queryParam, querySelector: get('query-selector'), submitSelector: get('submit-selector'), scope: scope(), readySelector }; break;
    }
    case 'scroll': action = { verb, direction: choice('direction', ['up', 'down', 'left', 'right'], 'down'), amount: options.has('amount') ? number('amount', 0, 1, 2560) : null, selector: get('selector'), readySelector }; break;
    case 'click': case 'similar':
      if (options.has('selector') === options.has('text')) browseFail('BROWSE_USAGE', 'choose exactly one --selector or --text', 2);
      action = { verb, selector: get('selector'), text: get('text'), readySelector }; break;
    case 'back': action = { verb, readySelector }; break;
    case 'shot': pair('screen-id', 'state'); action = { verb, selector: get('selector'), screenId: get('screen-id'), state: get('state'), assertVisible: options.get('assert-visible') ?? [], assertHidden: options.get('assert-hidden') ?? [] }; break;
    case 'crop': action = { verb, selector: required('selector'), reference: get('reference'), as: get('as'), slot: get('slot') }; break;
    case 'keep': action = { verb, sourceApp: get('source-app'), capture: get('capture'), lane: options.has('lane') ? choice('lane', ['domain', 'design'] as const) : null, reason: reason(), role: options.has('role') ? choice('role', ['visual-direction', 'component-support', 'task-flow'] as const) : null, direction: get('direction'), rights: choice('rights', ['allowed', 'restricted', 'unknown'], 'unknown'), rightsNotes: get('rights-notes') }; break;
    case 'drop': action = { verb, keep: positionals[0] ?? null, reason: reason() }; break;
    case 'contact-sheet': action = { verb, page: number('page', 1, 1, 128), columns: number('columns', 3, 2, 4) as 2 | 3 | 4 }; break;
    case 'status': action = { verb }; break;
    case 'end': action = { verb, reason: choice('reason', ['complete', 'budget', 'saturated', 'interrupted'], 'complete') }; break;
    default: return browseFail('BROWSE_USAGE', 'unsupported command', 2);
  }
  const session = get('session'), expectHead = get('expect-head');
  if ((session && !/^[a-f0-9]{32}$/.test(session)) || (expectHead && !/^[a-f0-9]{64}$/.test(expectHead))) browseFail('BROWSE_USAGE', 'invalid session/head', 2);
  return { action, session, expectHead, activation: get('activation'), json: options.has('json') };
}
