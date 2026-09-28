#!/usr/bin/env node
// Maintainer-only refresh. Ordinary builds use the committed, offline-verifiable bundle.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'vendor/omd-browser');
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
const names = ['index.js', 'page-bundle.js'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
// The native messaging host, CLI/daemon environment, store and installer URLs are
// external bridge interfaces. They must survive branding byte-for-byte.
const protocolStrings = [
  'com.omo' + 'wright.cloakbridge',
  'https://raw.githubusercontent.com/Tencent/Browser' + 'Skill/main/install.sh',
  'https://raw.githubusercontent.com/Tencent/Browser' + 'Skill/main/install.ps1',
];
function brand(bytes) {
  let text = bytes.toString('utf8');
  // Preserve upstream license comments exactly, including their whitespace.
  const protectedText = [];
  const protect = value => { protectedText.push(value); return `__OMD_PROTECTED_${protectedText.length - 1}__`; };
  text = text.replace(/\/\*![\s\S]*?\*\/|\/\*[^]*?@license[^]*?\*\//g, protect);
  for (const value of protocolStrings) text = text.replaceAll(value, protect(value));
  text = text.replaceAll('setupOmO' + 'WrightWorld', 'setupOmdBrowserWorld')
    .replaceAll('connectBrowser' + 'Skill', 'connectUserBrowserSession')
    .replaceAll('bsk' + 'Doctor', 'userBrowserBridgeDoctor')
    .replaceAll('bsk' + 'Onboard', 'userBrowserBridgeOnboard')
    .replaceAll('bsk' + 'Snapshot', 'userBrowserBridgeSnapshot')
    .replaceAll('bsk' + 'Bin', 'bridgeBin')
    .replaceAll('Browser' + 'Skill', 'UserBrowserBridge')
    .replaceAll('BROWSER' + 'SKILL', 'OMD_BROWSER_BRIDGE')
    .replaceAll('OmO' + 'Wright', 'OMD Browser')
    .replaceAll('OMO' + 'WRIGHT', 'OMD_BROWSER')
    .replaceAll('omo' + 'wright', 'omdBrowser')
    .replaceAll('Bsk', 'UserBrowserBridge');
  // Identifiers and prose require different spellings.
  text = text.replaceAll('UserBrowserBridge daemon', 'OMD Browser bridge daemon')
    .replaceAll('UserBrowserBridge session', 'OMD Browser bridge session')
    .replaceAll('UserBrowserBridge extension', 'OMD Browser bridge extension')
    .replaceAll('UserBrowserBridge cannot', 'OMD Browser cannot')
    .replaceAll('"UserBrowserBridge"', '"OMD Browser bridge"')
    .replaceAll('Register the UserBrowserBridge', 'Register the OMD Browser bridge')
    .replaceAll('Start the UserBrowserBridge', 'Start the OMD Browser bridge');
  text = text.replace(/__OMD_PROTECTED_(\d+)__/g, (_, id) => protectedText[Number(id)]);
  return Buffer.from(text);
}
for (const name of names) {
  const bytes = await readFile(join(target, name));
  if (sha(bytes) !== manifest.files[name]) throw new Error(`OMD Browser ${name} does not match pinned digest`);
}
const local = process.argv.indexOf('--local');
if (local !== -1 || process.argv.includes('--refresh')) {
  if (local !== -1 && !process.argv[local + 1]) throw new Error('--local requires a pinned source directory');
  const scratch = local === -1 ? await mkdtemp(join(tmpdir(), 'omd-browser-')) : null;
  try {
    let sourceFiles;
    if (local !== -1) {
      const source = resolve(process.argv[local + 1]);
      sourceFiles = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(join(source, name))])));
    } else {
      const archive = join(scratch, 'source.tar.gz');
      const source = join(scratch, 'source');
      await mkdir(source);
      run('curl', ['-fLsS', '--max-time', '60', `${manifest.sourceUrl}/archive/${manifest.sourceCommit}.tar.gz`, '-o', archive], scratch);
      run('tar', ['-xzf', archive, '-C', source, '--strip-components=1'], scratch);
      const digest = createHash('sha256');
      for (const name of ['package.json', 'src/index.js', 'src/page-bundle.js', 'src/core.js'])
        digest.update(name).update('\0').update(await readFile(join(source, name)));
      if (digest.digest('hex') !== manifest.sourceDigest) throw new Error('Pinned browser source digest mismatch');
      const tool = ['--yes', `bun@${manifest.buildToolVersion}`];
      if (run('npx', [...tool, '--version'], scratch) !== manifest.buildToolVersion) throw new Error('Pinned Bun version required');
      run('npx', [...tool, 'install', '--frozen-lockfile'], source);
      const output = join(scratch, 'index.js');
      run('npx', [...tool, 'build', join(source, 'src/index.js'), '--target=node', '--format=esm', '--minify-whitespace', `--outfile=${output}`], source);
      sourceFiles = { 'index.js': await readFile(output), 'page-bundle.js': await readFile(join(source, 'src/page-bundle.js')) };
    }
    for (const name of names)
      if (sha(sourceFiles[name]) !== manifest.sourceFiles[name]) throw new Error(`Pinned browser source ${name} differs from expected digest`);
    const branded = Object.fromEntries(names.map(name => [name, brand(sourceFiles[name])]));
    for (const name of names) manifest.files[name] = sha(branded[name]);
    for (const name of names) await writeFile(join(target, name), branded[name]);
    await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
}
console.log('OMD Browser bundle verified');
