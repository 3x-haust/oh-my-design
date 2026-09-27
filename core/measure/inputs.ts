import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { measurementBlock, parseCompositionContract, parseTypeContract, type Contracts } from './contracts.ts';
import { digest, sha256 } from './identity.ts';
import type { VisualMeasurement } from './types.ts';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { validateTokenCommit, minimalTokenScales } from '../tokens/contract.ts';
import { parseRouteRecord } from '../route/adaptive-route-record.ts';
import { currentSelectedSystem } from './selected-system.ts';
export const readArtifact = (root: string, path: string): Buffer => readStableProjectFile({ root: realpathSync(root), path: resolve(realpathSync(root), path), label: path, fs: nodeStableProjectFileSystem() });
export const sourceDigest = (root: string): string => digest(listProductionSourceFiles(root).map(path => ({ path, sha256: sha256(readArtifact(root, path)) })));
export const MEASUREMENT_POLICY = Object.freeze({ version: 'visual-metrics-v1', fontSizeTolerance: 0.25, spacingTolerance: 0.5, tinyTextBoundary: 12, contrastLargePx: 24, contrastBoldPx: 18.6666667, contrastBoldWeight: 700, contrastSmall: 4.5, contrastLarge: 3, hueSaturation: 0.30, hueLightness: [0.15, 0.90], hueDistance: 25, gridStep: 16, maxNodes: 4000, maxGraphemes: 100000, physicalGlyphIdentity: 'unmeasured' });
export function methodIdentity(browserVersion: string): VisualMeasurement['method'] {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const files = [...readdirSync(directory).filter(f => f.endsWith('.ts')).map(f => join(directory, f)), fileURLToPath(new URL('../ir/dom.ts', import.meta.url)), fileURLToPath(new URL('../render/browser-zoom.ts', import.meta.url)), fileURLToPath(new URL('../render/zoom-extension/manifest.json', import.meta.url)), fileURLToPath(new URL('../render/zoom-extension/worker.js', import.meta.url))];
  return { version: 'visual-metrics-v1', implementationSha256: digest(files.sort().map(path => ({ path: path.replace(/^.*\/core\//, 'core/'), sha256: sha256(readFileSync(path)) }))), policySha256: digest(MEASUREMENT_POLICY), browser: { name: 'chromium', version: browserVersion, executableSha256: sha256(readFileSync(chromium.executablePath())) } };
}
export function loadContracts(root: string): { contracts: Contracts; inputs: VisualMeasurement['binding']['inputs'] } {
  const contracts: Contracts = { type: null, composition: null, tokens: null, errors: [] }, inputs: VisualMeasurement['binding']['inputs'] = [];
  const selected = currentSelectedSystem(root);
  for (const [path, kind] of [['.omd/type-proof.md', 'type-proof'], ['.omd/composition.md', 'composition'], ['.omd/tokens.json', 'tokens'], ['.omd/frame.md', 'frame'], ['.omd/design-judgment.json', 'hypothesis']] as const) {
    if (!existsSync(resolve(root, path))) continue;
    const bytes = readArtifact(root, path), hash = sha256(bytes);
    inputs.push({ kind, receipt: { path, sha256: hash }, consumedContractSha256: hash });
    try {
      if (kind === 'type-proof') contracts.type = parseTypeContract(measurementBlock(bytes.toString('utf8')));
      if (kind === 'composition') contracts.composition = parseCompositionContract(measurementBlock(bytes.toString('utf8')));
      if (kind === 'tokens') {
        const token = selected?.tokens.effective ?? validateTokenCommit(JSON.parse(bytes.toString('utf8')));
        contracts.tokens = token;
        const scales = token.schema === 'token-commit-v3' ? minimalTokenScales(token) : token;
        if (contracts.composition?.spacing && contracts.composition.spacing.scale.some(s => !scales.spacingScale.includes(s))) contracts.errors.push('CONTRACT_INPUT_CONFLICT: composition and committed spacing scales disagree');
        if (contracts.composition && !contracts.composition.spacing) contracts.composition.spacing = { scale: [...scales.spacingScale], tolerance: 0.5, opticalExceptions: [] };
      }
    } catch (error) { contracts.errors.push(`${kind}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (selected) {
    contracts.tokens = selected.tokens.effective;
    contracts.selectedAssignments = selected.assignments;
    const tokenInput = inputs.find(i => i.kind === 'tokens');
    if (tokenInput) tokenInput.consumedContractSha256 = selected.tokens.effectiveTokensSha256;
    for (const receipt of selected.receipts.filter(r => r.path !== '.omd/tokens.json')) inputs.push({ kind: 'selected-system', receipt, consumedContractSha256: selected.tokens.effectiveTokensSha256 });
  }
  if ((!contracts.type || !contracts.composition) && existsSync(resolve(root, '.omd/route.json'))) {
    const pointer = JSON.parse(readArtifact(root, '.omd/route.json').toString('utf8')) as { record: string; sha256: string };
    const path = `.omd/${pointer.record}`, bytes = readArtifact(root, path);
    if (sha256(bytes) !== pointer.sha256) throw new Error('VISUAL_MEASUREMENT: route applicability bytes changed');
    const route = parseRouteRecord(JSON.parse(bytes.toString('utf8')));
    const skipped: NonNullable<Contracts['routeSkipped']> = {};
    for (const [kind, id] of [['type', 'type-proof'], ['composition', 'composition']] as const) {
      const skip = route.strategy.skips.find(s => s.id === id);
      if (contracts[kind] === null && !existsSync(resolve(root, `.omd/${id}.md`)) && skip && !route.strategy.stages.includes(id)) skipped[kind] = skip.reason;
    }
    if (Object.keys(skipped).length) {
      contracts.routeSkipped = skipped;
      inputs.push({ kind: 'route-applicability', receipt: { path, sha256: pointer.sha256 }, consumedContractSha256: digest(skipped) });
    }
  }
  return { contracts, inputs };
}
export function inputBinding(root: string, entry: string | null, scopeSha256: string, invocation?: ProjectRunInvocation): VisualMeasurement['binding'] {
  const { inputs } = loadContracts(root);
  let routeSha256: string | null = null, sourceContractSha256: string | null = null;
  if (existsSync(resolve(root, '.omd/route.json'))) {
    if (!invocation) throw new Error('VISUAL_MEASUREMENT: routed capture requires the current invocation');
    const route = readPersistedRoute(root, invocation); routeSha256 = JSON.parse(readArtifact(root, '.omd/route.json').toString('utf8')).sha256; sourceContractSha256 = route.sourceContractSha256;
  }
  return { authority: entry === null ? 'external-diagnostic' : 'native-local', projectIdentitySha256: digest(realpathSync(root)), routeSha256, sourceContractSha256, activationBuildSha256: invocation?.current.buildSha256 ?? null, sourceSha256: sourceDigest(root), production: entry === null ? [] : [{ entry, servedTreeSha256: servedProjectTreeSha256(root, entry) }], inputs, scopeSha256 };
}
