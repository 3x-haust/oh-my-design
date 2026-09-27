#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TIER_NAMES = ['unit', 'integration', 'browser', 'native', 'packaging'] as const;
type Tier = (typeof TIER_NAMES)[number];

const NATIVE_LIFECYCLE = new Set([
  'test/benchmark-native-publish.test.ts',
  'test/benchmark-dependency-snapshot.test.ts',
  'test/browser-rs-doctor-runtime.test.ts',
  'test/browser-rs-temporary.test.ts',
  'test/harness-v2-cli.test.ts',
  'test/discovery-http-binding.test.ts',
  'test/cold-start-workflow.test.ts',
  'test/human-design-loop.test.ts',
  'test/static-direction-evidence.test.ts',
]);

const DIST_DEPENDENT = new Set([
  'test/browser-cli.test.ts',
  'test/browser-install-cli.test.ts',
  'test/build-metadata.test.ts',
  'test/finish-pass.test.ts',
  'test/install.test.ts',
  'test/packed-bin-runtime.test.ts',
  'test/packed-prebuilt-dist.test.ts',
  'test/prebuilt-dist.test.ts',
]);

function classify(file: string, source: string): Tier {
  if (DIST_DEPENDENT.has(file) || /\bnpm\s*(?:,|\.)[^\n]{0,80}\bpack\b|\bpackOfflineWorkspaceDependencies\b|\bpacked-(?:runtime|playwright|prebuilt)\b/.test(source)) return 'packaging';
  if (NATIVE_LIFECYCLE.has(file) || /browser-rs/.test(file) || /benchmark-(?:lock|membership)\.test\.ts$/.test(file)) return 'native';
  if (!file.endsWith('/headless-only.test.ts') && /\b(?:withBrowser|withLocalView|renderPage|measureProject|runTrustedBrowserEvaluation|extractIr|chromium\.launch|launchPersistentContext|captureMotionEvidenceV2|renderFilmstrip|captureRenderedBeatReceipt)\s*\(/.test(source)) return 'browser';
  if (/node:(?:fs|fs\/promises|child_process|http|https|net|tls|dgram|worker_threads)|\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\(|\bmkdtemp(?:Sync)?\s*\(|\bcreateServer\s*\(/.test(source)) return 'integration';
  return 'unit';
}

const tiers: Record<Tier, string[]> = { unit: [], integration: [], browser: [], native: [], packaging: [] };
for (const name of readdirSync(join(ROOT, 'test')).filter((entry) => entry.endsWith('.test.ts')).sort()) {
  const file = `test/${name}`;
  tiers[classify(file, readFileSync(join(ROOT, file), 'utf8'))].push(file);
}

const manifest = { version: 1, tiers };
const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--write')) {
  writeFileSync(join(ROOT, 'test/test-manifest.json'), output);
  console.error(`wrote ${Object.values(tiers).reduce((sum, files) => sum + files.length, 0)} tests to test/test-manifest.json`);
} else {
  process.stdout.write(output);
}
