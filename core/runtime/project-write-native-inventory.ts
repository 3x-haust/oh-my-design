import type { UnguardedProjectMutation } from './project-write-inventory.ts';

type WriterAudit = Readonly<{
  exception: string;
  writes: readonly (readonly [operation: string, sourceLine: string])[];
  invariants: readonly string[];
  sequences: readonly (readonly string[])[];
}>;

const audits: ReadonlyMap<string, WriterAudit> = new Map([
  ['core/runtime/native-pi-run-record.ts', {
    exception: 'native Pi host bootstrap store (observed host and current request bound to a fixed signed run)',
    writes: [
      ['mkdirSync', 'if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });'],
      ['writeFileSync', "writeFileSync(path, `${canonicalRouteJson({ schema: 'native-pi-run-v1', run, signature })}\\n`, { flag: 'wx', mode: 0o600 });"],
    ],
    invariants: [
      "const allowed = relativePath === '.omd/native-pi' || HOST_PAYLOAD_AUTHORIZATION_PURPOSES.some(purpose =>",
      "new RegExp(`^\\\\.omd/native-pi/payloads/[a-f0-9]{64}/${purpose}$`, 'u').test(relativePath)",
      '!stat.isDirectory() || stat.isSymbolicLink()',
      "manifest.name !== '@earendil-works/pi-coding-agent' && manifest.name !== '@mariozechner/pi-coding-agent'",
      'const request = readPiRequest(projectRoot);', 'if (request === undefined)',
      "!skill.equals(readFileSync(join(input.runtimeRoot, 'src/skills/omd-ultradesign/SKILL.md')))",
      "const path = join(nativePiDirectory(run.projectRoot, '.omd/native-pi'), 'run.json');",
      "verifyNativeObservation(root, 'pi-run', nativePiDigest(canonicalRouteJson(run)), record.signature)",
    ],
    sequences: [
      ['export function nativePiDirectory(', 'if (!allowed || root !== realpathSync(root))', 'mkdirSync(current,'],
      ['export function publishNativePiRun(input: NativePiRunInput)', 'const host = observedNativePiHost(input);',
        'const identity = { ...currentNativePiIdentity(input), host };', 'nativePiDirectory(run.projectRoot,',
        'const previous = readSignedNativePiRun(run.projectRoot, path);', 'if (previous.runId !== run.runId)',
        "signNativeObservation(run.projectRoot, 'pi-run'", 'writeFileSync(path,'],
    ],
  }],
  ['extensions/omd-request-source.ts', {
    exception: 'native Pi user-input observation store (signed fixed project paths and private staging)',
    writes: [
      ['mkdirSync', 'try { mkdirSync(current, { mode: 0o700 }); }'],
      ['writeFileSync', "writeFileSync(join(projectRoot, record), bytes, { flag: 'wx', mode: 0o600 });"],
      ['writeFileSync', "writeFileSync(staging, `${canonicalRouteJson({ schema: 'pi-request-source-pointer-v1', record, sha256: recordSha256 })}\\n`, { flag: 'wx', mode: 0o600 });"],
      ['renameSync', 'renameSync(staging, join(projectRoot, POINTER));'],
      ['unlinkSync', 'if (existsSync(staging)) unlinkSync(staging);'],
    ],
    invariants: [
      "const POINTER = '.omd/request-source.json';", "const DIRECTORY = '.omd/request-sources';",
      '!stat.isDirectory() || stat.isSymbolicLink()', "directory(projectRoot, '.omd/activation');",
      'const record = `${DIRECTORY}/sha256-${recordSha256}.json`;',
      "const staging = join(projectRoot, `.omd/.request-source-${randomBytes(8).toString('hex')}.tmp`);",
      'verifyNativeObservation(projectRoot, KIND, requestDigest(canonicalRouteJson(payload)), signature)',
    ],
    sequences: [[
      'const projectRoot = realpathSync(root);', 'directory(projectRoot, DIRECTORY);',
      'signNativeObservation(projectRoot, KIND, requestDigest(canonicalRouteJson(payload)))',
      'writeFileSync(join(projectRoot, record), bytes', 'writeFileSync(staging,',
      'renameSync(staging, join(projectRoot, POINTER));', '} finally {', 'unlinkSync(staging);',
    ]],
  }],
  ['core/runtime/native-pi-run.ts', {
    exception: 'native Pi command and payload authority transport (opaque run capability and exact signed payload)',
    writes: [
      ['mkdtempSync', "const directory = mkdtempSync(join(tmpdir(), 'omd-pi-command-'));"],
      ['writeFileSync', "writeFileSync(path, canonicalRouteJson({ ...payload, signature }), { mode: 0o600, flag: 'wx' });"],
      ['rmSync', 'catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }'],
      ['rmSync', 'return Object.freeze({ path, argv, dispose: () => rmSync(directory, { recursive: true, force: true }) });'],
      ['writeFileSync', "writeFileSync(path, canonicalRouteJson({ ...payload, signature }), { flag: 'wx', mode: 0o600 });"],
    ],
    invariants: [
      'const issuedRuns = new WeakSet<object>();', "const path = join(directory, 'command.json');",
      'if (!issuedRuns.has(input.run))', 'const invocations = new WeakMap<object, AcceptedPiCommand>();',
      'const accepted = invocations.get(invocation);', '!accepted || accepted.run.projectRoot !== realpathSync(root)',
      '!HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(purpose) || !(bytes instanceof Uint8Array)',
      'const directory = nativePiDirectory(run.projectRoot, `.omd/native-pi/payloads/${run.runId}/${purpose}`);',
      'const path = join(directory, `${payloadSha256}.json`);',
      'if (existsSync(path)) { requireNativePiPayload(invocation, root, purpose, bytes); return; }',
    ],
    sequences: [
      ['if (!issuedRuns.has(input.run))', 'mkdtempSync(', 'try {\n    const receipt = mintSelfSignedReceipt(',
        "signNativeObservation(input.run.projectRoot, 'pi-command'", 'writeFileSync(path,',
        'catch (error) { rmSync(directory,', 'dispose: () => rmSync(directory,'],
      ['export function authorizeNativePiPayload(', 'const run = getNativePiRun(invocation, root);',
        'const payloadSha256 = nativePiDigest(bytes);', 'const directory = nativePiDirectory(run.projectRoot,',
        "signNativeObservation(root, 'pi-derived-payload'", 'writeFileSync(path,'],
    ],
  }],
  ['adapters/pi-reviewer-runtime.ts', {
    exception: 'native Pi reviewer private sandbox (current opaque invocation and fixed isolated child files)',
    writes: [
      ['mkdtempSync', "const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omd-pi-reviewer-')));"],
      ['writeFileSync', "writeFileSync(systemPath, SYSTEM, { mode: 0o600, flag: 'wx' });"],
      ['writeFileSync', 'writeFileSync(configPath, JSON.stringify({ schema: PI_REVIEWER_BRIDGE_SCHEMA, nodePath: proxy.command, args: proxy.args,'],
      ['rmSync', '} finally { await rpc?.dispose(); adapter.dispose(); rmSync(directory, { recursive: true, force: true }); }'],
    ],
    invariants: [
      "const systemPath = join(directory, 'system.txt');", "const configPath = join(directory, 'bridge.json');",
      "'--no-context-files', '--no-approve', '--no-tools'", "'-e', bridgePath, '--tools', PI_REVIEWER_TOOL",
      "thinkingLevel: host.thinkingLevel }), { mode: 0o600, flag: 'wx' });",
      'validateCurrentProjectRun(input.invocation);',
    ],
    sequences: [[
      'async function runChild(', 'const run = getNativePiRun(input.invocation, input.root);',
      'const packet = packetContract(input);', 'mkdtempSync(', 'try {', 'writeFileSync(systemPath,',
      'rpc = new PiReviewerRpc(', 'writeFileSync(configPath,',
      'adapter.consumeCompletedLaunchBundle(', 'await rpc.finish();',
      'getNativePiRun(input.invocation, input.root);', 'signature: signNativeObservation(',
      '} finally { await rpc?.dispose();', 'rmSync(directory,',
    ]],
  }],
]);

function ordered(source: string, sequence: readonly string[]): boolean {
  let offset = 0;
  for (const fragment of sequence) {
    const position = source.indexOf(fragment, offset);
    if (position < 0) return false;
    offset = position + fragment.length;
  }
  return true;
}

export function nativePiWriterException(filePath: string, source: string, mutations: readonly UnguardedProjectMutation[]): string | undefined {
  const audit = audits.get(filePath);
  if (audit === undefined) return;
  const actual = mutations.map(mutation => `${mutation.operation}\0${mutation.sourceLine.trim()}`).sort();
  const expected = audit.writes.map(([operation, line]) => `${operation}\0${line}`).sort();
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])
    || !audit.invariants.every(fragment => source.includes(fragment))
    || !audit.sequences.every(sequence => ordered(source, sequence))) return;
  return audit.exception;
}
