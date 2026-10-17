import { accessSync, constants, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractPackSections, PackSectionError } from '../../core/pack-sections.ts';
import { analyse } from '../../core/coach/index.ts';
import { readHistory } from '../../core/history/index.ts';
import {
  ROOT,
  inputJson,
  invocationFromActivation,
  parseArgs,
  projectWriterFromActivation,
  type Opts,
} from '../cli/runtime.ts';

async function cmdUsage(opts: Opts): Promise<never> {
  const { computeRunUsage, formatRunUsage } = await import('../../core/usage/index.ts');
  const u = computeRunUsage(process.cwd());
  if (!u) {
    if (opts.json) process.stdout.write('null');
    else console.log('실행 사용량: 호스트 세션 로그를 찾지 못했습니다 (Claude Code / Codex 세션 로그 없음).');
    process.exit(0);
  }
  if (opts.json) process.stdout.write(JSON.stringify(u));
  else console.log(formatRunUsage(u));
  process.exit(0);
}

function readDecisionBlocks(cwd: string): string[] {
  const path = join(cwd, '.omd', 'decisions.md');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/^## /m).slice(1);
}

function cmdCoach(): never {
  const report = analyse(readHistory(process.cwd()), readDecisionBlocks(process.cwd()));

  if (report.runs === 0) {
    console.log('No check history yet. Run `omd check` on something.');
    process.exit(0);
  }

  if (!report.confident) {
    console.log(`Seen ${report.runs} run${report.runs === 1 ? '' : 's'} so far.`);
    for (const r of report.recurring) console.log(`  ${r.rule}  ${r.total} findings across ${r.runs} runs`);
    console.log(`\nToo little history to claim a trend. Four runs is the minimum; there are ${report.runs}.`);
    process.exit(0);
  }

  for (const r of report.recurring) {
    // A rule with no baseline has no percentage. Say "appeared", never a fabricated number.
    const delta = r.changePct === null ? 'appeared' : `${r.changePct > 0 ? '+' : ''}${r.changePct}%`;
    console.log(`${r.rule}  ${r.total} findings across ${r.runs} runs   ${delta}  ${r.trend}`);
  }

  if (report.overrules.length > 0) {
    console.log('\nOverruled:');
    for (const o of report.overrules) console.log(`  ${o.rule}  x${o.count}`);
  }

  process.exit(0);
}

async function cmdLearn(mode: string | undefined, opts: Opts): Promise<never> {
  const learning = await import('../../core/learning/index.ts');
  if (mode === 'predict') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd learn predict --input <prediction.json> [--activation <host-issued-invocation.json>] [--json]');
    const result = learning.recordLearningPrediction(process.cwd(), inputJson(opts.input, 'omd learn predict') as Parameters<typeof learning.recordLearningPrediction>[1], projectWriterFromActivation(opts, 'omd learn predict'));
    if (opts.json) process.stdout.write(JSON.stringify(result)); else console.log(`prediction: ${result.proposition.id} — ${result.proposition.statement}`);
    process.exit(0);
  }
  if (mode === 'judge') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd learn judge --input <judgment.json> [--activation <host-issued-invocation.json>] [--json]');
    const result = learning.recordLearningAuthorityJudgment(process.cwd(),
      inputJson(opts.input, 'omd learn judge') as Parameters<typeof learning.recordLearningAuthorityJudgment>[1],
      projectWriterFromActivation(opts, 'omd learn judge'));
    if (opts.json) process.stdout.write(JSON.stringify(result)); else console.log(`learning judgment: ${result.decision}`);
    process.exit(0);
  }
  if (mode === 'observe') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd learn observe --input <observation.json> [--activation <host-issued-invocation.json>] [--json]');
    const result = learning.recordLearningObservation(process.cwd(), inputJson(opts.input, 'omd learn observe') as Parameters<typeof learning.recordLearningObservation>[1], projectWriterFromActivation(opts, 'omd learn observe'));
    if (opts.json) process.stdout.write(JSON.stringify(result)); else console.log(`observation: ${result.predictionId} ${result.outcome} (${result.runId})`);
    process.exit(0);
  }
  if (mode === 'promote') {
    if (opts.input || opts._.length > 0) throw new Error('usage: omd learn promote [--activation <host-issued-invocation.json>] [--json]');
    const result = learning.promoteLearnings(process.cwd(), projectWriterFromActivation(opts, 'omd learn promote'));
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else {
      for (const item of result.results) console.log(`${item.proposition.id}: ${item.status}${item.blockers.length ? ` (${item.blockers.join(', ')})` : ''}`);
      console.log(`calibration: ${result.calibration.hits}/${result.calibration.observations} predicted outcomes matched${result.calibration.hitRate === null ? '' : ` (${(result.calibration.hitRate * 100).toFixed(1)}%)`}`);
      console.log(`index: ${result.index.location}${result.index.path ? ` — ${result.index.path}` : ''}`);
    }
    process.exit(0);
  }
  if (mode === 'rules') {
    if (typeof opts.surface !== 'string' || opts.input || opts._.length > 0) throw new Error('usage: omd learn rules --surface <kind> [--route <path>] --json');
    const rules = learning.applicableLearnedRules({ surface: opts.surface, ...(opts.route === undefined ? {} : { route: opts.route }) });
    if (opts.json) process.stdout.write(JSON.stringify(rules)); else for (const rule of rules) console.log(`${rule.id}: ${rule.statement}`);
    process.exit(0);
  }
  throw new Error('usage: omd learn predict|judge|observe --input <json> | promote | rules --surface <kind> [--json]');
}

async function cmdBrowser(mode: string | undefined, opts: Opts): Promise<never> {
  if (opts._.length || Object.keys(opts).some(key => !['_', 'json', 'sites', 'consent', 'engine', 'browser', 'decision', 'userAnswer'].includes(key)))
    throw new Error('usage: omd browser setup|login --engine user-browser|omd-profile --consent [--browser <id>] [--sites <https-url[,https-url]>] [--json] | status|forget [--json]');
  if (opts.userAnswer !== undefined && (typeof opts.userAnswer !== 'string' || !opts.userAnswer.trim()))
    throw new Error('OMD_BROWSER_SETUP_CONSENT_REQUIRED: --user-answer must be the exact nonempty user turn');
  const { browserProfilePath, forgetBrowserProfile, forgetBrowserConsent, readBrowserConsent, writeBrowserConsent,
    readUserBrowserConsent, writeUserBrowserConsent, readBrowserAnswerReceipt, clearBrowserAnswerReceipt } = await import('../../core/ref/browser-consent.ts');
  const { userBrowserDoctor, installUserBrowserBridge } = await import('../../core/browser/setup.ts');
  if (opts.engine !== undefined && opts.engine !== 'user-browser' && opts.engine !== 'omd-profile')
    throw new Error('OMD_BROWSER_ENGINE_INVALID: use user-browser or omd-profile');
  if (opts.browser !== undefined && (typeof opts.browser !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(opts.browser)))
    throw new Error('OMD_BROWSER_CHOICE_INVALID: use an available Chromium-family browser id');
  if (opts.browser !== undefined && opts.engine !== 'user-browser') throw new Error('OMD_BROWSER_CHOICE_INVALID: --browser requires --engine user-browser');
  const { readReferenceBrowserConfig } = await import('../../core/ref/browser-config.ts');
  if (mode === 'status') {
    if (opts.sites !== undefined || opts.consent || opts.engine !== undefined || opts.userAnswer !== undefined) throw new Error('usage: omd browser status [--browser <id>] [--json]');
    const doctor = await userBrowserDoctor(opts.browser);
    const record = { schema: 'omd-browser-status-v2', consent: readBrowserConsent(), userBrowserConsent: readUserBrowserConsent(),
      userBrowser: doctor, profilePresent: existsSync(browserProfilePath()),
      mode: readReferenceBrowserConfig().mode, advancedOverrides: {
        cdp: Boolean(process.env.OMD_BROWSER_CDP_URL), storageState: Boolean(process.env.OMD_BROWSER_STORAGE_STATE),
        stealth: Boolean(process.env.OMD_STEALTH_BROWSER_PATH) } };
    console.log(opts.json ? JSON.stringify(record) : `browser: ${record.mode}; user-browser: ${doctor.state}${doctor.browser ? ` (${doctor.browser.label})` : ''}; consent: ${record.userBrowserConsent ?? 'not asked'}; profile: ${record.profilePresent ? 'present' : 'absent'}`);
    process.exit(0);
  }
  if (['setup', 'login', 'skip'].includes(mode ?? '') && opts.userAnswer !== undefined
    && readBrowserAnswerReceipt()?.userText !== opts.userAnswer)
    throw new Error('OMD_BROWSER_SETUP_CONSENT_REQUIRED: --user-answer is not a later interactive or rpc answer to the current question');
  if (mode === 'skip') {
    if (opts.decision !== 'skipped-this-run' && opts.decision !== 'never-ask' || opts.consent || opts.engine || opts.sites || opts.browser)
      throw new Error('usage: omd browser skip --decision skipped-this-run|never-ask [--json]');
    writeBrowserConsent(opts.decision);
    writeUserBrowserConsent(opts.decision);
    if (opts.userAnswer !== undefined) clearBrowserAnswerReceipt();
    console.log(JSON.stringify({ schema: 'omd-browser-consent-v1', decision: opts.decision }));
    process.exit(0);
  }
  if (mode === 'forget') {
    if (opts.sites !== undefined || opts.consent || opts.engine !== undefined || opts.browser !== undefined || opts.userAnswer !== undefined) throw new Error('usage: omd browser forget [--json]');
    forgetBrowserConsent();
    forgetBrowserProfile();
    console.log(opts.json ? JSON.stringify({ schema: 'omd-browser-status-v1', consent: null, profilePresent: false }) : 'browser consent and dedicated profile removed');
    process.exit(0);
  }
  if (mode !== 'setup' && mode !== 'login') throw new Error('usage: omd browser setup|login|status|forget');
  if (opts.consent !== true) throw new Error('OMD_BROWSER_SETUP_CONSENT_REQUIRED: Ask before granting access to the logged-in user browser (reduced network isolation), or opening a dedicated OMD profile. Run setup --consent only after an explicit yes.');
  if (opts.engine === 'user-browser') {
    if (mode === 'setup') {
      const result = await installUserBrowserBridge(opts.browser);
      if (result.state === 'ready' || result.state === 'pending-human-step') {
        writeUserBrowserConsent('consented');
        if (opts.userAnswer !== undefined) clearBrowserAnswerReceipt();
      }
      console.log(opts.json ? JSON.stringify({ schema: 'omd-browser-setup-v2', engine: 'user-browser', ...result })
        : `browser setup: ${result.state}${result.humanStep ? `; ${result.humanStep}` : ''}`);
      process.exit(result.state === 'failed' ? 1 : 0);
    }
    if ((await userBrowserDoctor(opts.browser)).state !== 'ready') throw new Error('OMD_BROWSER_BRIDGE_NOT_READY: run omd browser setup --engine user-browser --consent first');
  }
  const { publicDiscoveryUrl } = await import('../../core/ref/discovery-record.ts');
  const sites = opts.sites === undefined ? ['https://mobbin.com/', 'https://www.pinterest.com/', 'https://dribbble.com/']
    : typeof opts.sites === 'string' ? opts.sites.split(',').map(site => site.trim()) : [];
  if (!sites.length || sites.length > 8 || sites.some(site => !site || !site.startsWith('https://')))
    throw new Error('REFERENCE_BROWSER_CONFIG_INVALID: --sites requires 1..8 HTTPS URLs separated by commas');
  const urls = sites.map(site => publicDiscoveryUrl(site));
  if (opts.engine === 'user-browser') {
    const { withUserBrowserPage } = await import('../../core/ref/user-browser-engine.ts');
    const { assertPublicNetworkUrl } = await import('../../core/ref/public-network.ts');
    await withUserBrowserPage({}, async page => {
      for (const url of urls) {
        await assertPublicNetworkUrl(url);
        await page.navigate(url);
        const outcome = await page.requestHelp({ title: 'Complete browser sign-in', prompt: 'Please sign in in this browser window.',
          completionCriteria: 'The requested page is visible after sign-in.', timeoutMs: 120_000 });
        if (!['completed', 'continued', 'navigated'].includes(outcome)) throw new Error(`OMD Browser login ${outcome}`);
      }
    });
    writeUserBrowserConsent('consented');
    if (opts.userAnswer !== undefined) clearBrowserAnswerReceipt();
    console.log(opts.json ? JSON.stringify({ schema: 'omd-browser-setup-v2', engine: 'user-browser', state: 'ready' }) : 'browser login completed');
    process.exit(0);
  }
  const { launchBrowserProfileLogin, profileLoginResult } = await import('../../core/ref/browser-profile.ts');
  const outcome = await launchBrowserProfileLogin({ sites: urls });
  const result = profileLoginResult(outcome);
  if (outcome === 'closed') {
    writeBrowserConsent('consented');
    if (opts.userAnswer !== undefined) clearBrowserAnswerReceipt();
  }
  console.log(opts.json ? JSON.stringify({ schema: 'omd-browser-setup-v1', outcome, consent: readBrowserConsent(),
    ...(result.limitation ? { limitation: result.limitation } : {}) })
    : `browser setup: ${outcome}${outcome === 'timeout' ? '; no human login completed; continue public research without the profile' : ''}`);
  process.exit(result.exitCode);
}

async function cmdDoctor(): Promise<never> {
  let allPass = true;

  function report(label: string, pass: boolean, detail?: string): void {
    console.log(`${pass ? 'pass' : 'fail'}  ${label}${detail ? `  (${detail})` : ''}`);
    if (!pass) allPass = false;
  }

  // Node version: package.json engines requires >=22.19
  const parts = process.versions.node.split('.').map(Number);
  const [major = 0, minor = 0] = parts;
  const nodeOk = major > 22 || (major === 22 && minor >= 19);
  report('node >=22.19', nodeOk, process.versions.node);

  // Playwright importability + chromium executable
  try {
    const { chromium } = await import('playwright');
    const exePath = chromium.executablePath();
    const exeExists = existsSync(exePath);
    report('playwright chromium', exeExists, exeExists ? 'found' : `not found: ${exePath}`);
  } catch {
    report('playwright chromium', false, 'playwright not importable — run: npx playwright install chromium');
  }

  for (const key of ['OMD_BROWSER_CDP_URL', 'OMD_BROWSER_STORAGE_STATE', 'OMD_STEALTH_BROWSER_PATH']) {
    report(key, true, process.env[key] ? 'configured (contents hidden)' : 'not set (optional)');
  }
  try {
    const { readReferenceBrowserConfig } = await import('../../core/ref/browser-config.ts');
    report('reference browser configuration', true, readReferenceBrowserConfig().mode);
  } catch (error) {
    report('reference browser configuration', false, error instanceof Error ? error.message : 'REFERENCE_BROWSER_CONFIG_INVALID');
  }

  const { readBrowserConsent, browserProfilePath } = await import('../../core/ref/browser-consent.ts');
  report('browser profile consent', true, `${readBrowserConsent() ?? 'not asked'}; dedicated profile ${existsSync(browserProfilePath()) ? 'present' : 'absent'} (omd browser setup|login|status|forget)`);
  const { readUserBrowserConsent } = await import('../../core/ref/browser-consent.ts');
  const { userBrowserDoctor } = await import('../../core/browser/setup.ts');
  const userDoctor = await userBrowserDoctor();
  report('OMD user browser', true, `${userDoctor.state}; consent ${readUserBrowserConsent() ?? 'not asked'}${userDoctor.browser ? `; ${userDoctor.browser.label}` : ''}`);

  // Preflight must not create a project record. Check the parent directory's write
  // permission, which is sufficient to create `.omd/` later without touching it now.
  try {
    accessSync(process.cwd(), constants.W_OK);
    report('.omd/ writable', true, 'not created during read-only preflight');
  } catch (e) {
    report('.omd/ writable', false, e instanceof Error ? e.message : String(e));
  }

  // Theory-pack files — resolved relative to the CLI's own root
  const theoryFiles = ['color.md', 'typography.md', 'layout.md', 'motion.md', 'expressive.md', 'components.md', 'craft.md', 'voice.md', 'ux.md'];
  for (const f of theoryFiles) {
    const path = join(ROOT, 'core', 'theory', f);
    report(`theory/${f}`, existsSync(path));
  }

  // FIGMA_TOKEN — optional. Figma integration is unavailable without it, but
  // absence is not a failure. Always report pass; note when not set.
  const figmaToken = process.env['FIGMA_TOKEN'];
  const figmaTokenSet = figmaToken !== undefined && figmaToken.trim().length > 0;
  report(
    'FIGMA_TOKEN',
    true,
    figmaTokenSet ? 'set' : 'not set — Figma optional; export FIGMA_TOKEN to enable omd figma pull',
  );

  process.exit(allPass ? 0 : 1);
}

function cmdPack(sub: string | undefined, ...rest: string[]): never {
  const packsRoot = join(ROOT, 'core');
  // `--section "<heading>"` prints one ##–###### section with descendants, in requested order. A
  // role that needs the framing rules should not pay for the whole protocol: the loop file alone
  // costs about sixteen thousand tokens to read.
  const sections: string[] = [];
  const parts: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--section') {
      const value = rest[++index];
      if (value === undefined) {
        console.error('usage: omd pack <relpath> --section "<heading>" [--section "<heading>"]');
        process.exit(1);
      }
      sections.push(value);
    } else parts.push(rest[index]!);
  }

  if (sub === 'dir') {
    console.log(packsRoot);
    process.exit(0);
  }

  if (sub === 'list') {
    function* walkMd(dir: string, rel: string): Generator<string> {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) yield* walkMd(join(dir, entry.name), entryRel);
        else if (entry.name.endsWith('.md')) yield entryRel;
      }
    }
    if (!existsSync(packsRoot)) {
      console.error(`pack root not found: ${packsRoot}`);
      process.exit(1);
    }
    for (const rel of walkMd(packsRoot, '')) console.log(rel);
    process.exit(0);
  }

  if (sub) {
    // `omd pack <relpath>` — treat `sub` as a relative path under the pack root.
    const target = join(packsRoot, sub, ...parts);
    if (!existsSync(target)) {
      console.error(`pack file not found: ${target}`);
      process.exit(1);
    }
    const body = readFileSync(target, 'utf8');
    if (sections.length === 0) {
      process.stdout.write(body);
      process.exit(0);
    }
    try {
      process.stdout.write(extractPackSections(body, sections));
    } catch (error) {
      if (!(error instanceof PackSectionError)) throw error;
      console.error(`${error.message}\nsections in ${sub}:\n${error.available.join('\n')}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error('usage: omd pack dir | list | <relpath> [--section "<heading>"]');
  process.exit(1);
}

function unknown(command: string, sub?: string): never {
  throw new Error(`unknown command ${command}${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runTooling(args: string[]): Promise<never> {
  const command = args[0]!;
  const sub = args[1];
  if (command === 'pack') return cmdPack(sub, ...args.slice(2));
  if (command === 'doctor') return cmdDoctor();
  if (command === 'browser') {
    if (!['setup', 'login', 'skip', 'status', 'forget'].includes(sub ?? '')) return unknown(command, sub);
    return cmdBrowser(sub, parseArgs(args.slice(2)));
  }
  if (command === 'coach') return cmdCoach();
  if (command === 'learn') return cmdLearn(sub, parseArgs(args.slice(2)));
  if (command === 'usage') return cmdUsage(parseArgs(args.slice(1)));
  if (command === 'hash') {
    const opts = parseArgs(args.slice(1));
    const path = opts._[0];
    if (!path || opts._.length !== 1) throw new Error('usage: omd hash <.omd/artifact-path> [--json]');
    const { artifactDigest } = await import('../../core/runtime/artifact-digest.ts');
    const result = artifactDigest(process.cwd(), path);
    console.log(opts.json ? JSON.stringify(result) : `${result.sha256}  ${result.path}`);
    process.exit(0);
  }
  return unknown(command, sub);
}

