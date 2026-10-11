import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makerFail, type MakerInput } from '../../adapters/pi-maker-contract.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readSelectedReferenceHandoff } from '../ref/selected-handoff.ts';
import { loadRefs } from '../ref/store.ts';
import { projection } from '../design-language/index.ts';
import { readFrame } from '../frame/index.ts';
import { validateTaskCoverageMatrix } from '../frame/check-ux.ts';
import { pathsOutsideScope, type RouteRecord } from '../route/index.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { validateProjectWritePath } from './project-write.ts';
import { readCurrentCulturalDesignProfile } from '../locale/cultural-profile-files.ts';
import { deriveTrustedEvaluationPlanFromProject } from './trusted-evaluation-plan.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { parseFunctionalRequirements } from '../completeness/index.ts';

export type MakerDocument = Readonly<{ path: string; content: string }>;
type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
const sourceExtension = /\.(?:[cm]?[jt]sx?|html|css|s[ac]ss|less|json|vue|svelte|mdx|py|rs|go|sql|ya?ml|toml|txt)$/i;
const privateName = /^(?:AGENTS|CLAUDE|SKILL|README)\.md$/i;

/** Only application text, never an ambient project instruction, store, dependency or history tree. */
export function makerSourcePaths(root: string, input: MakerInput, route: RouteRecord): readonly string[] {
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'coverage', 'vendor'].includes(entry.name)) continue;
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        if (pathsOutsideScope(route, [path]).length === 0) makerFail(`source-symlink:${path}`);
        continue;
      }
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && sourceExtension.test(path) && !privateName.test(entry.name)
        && pathsOutsideScope(route, [path]).length === 0) paths.push(path);
      if (paths.length > 128) makerFail('source-file-limit');
    }
  };
  switch (input.role) {
    case 'omd-hand': visit(''); break;
    case 'omd-sketch': {
      const directory = `.omd/.cache/sketches/${input.candidateId}`;
      validateProjectWritePath(root, `${directory}/index.html`);
      if (existsSync(join(root, directory))) visit(directory);
      break;
    }
    default: {
      const exhaustive: never = input.role;
      return exhaustive;
    }
  }
  for (const path of input.readPaths) {
    if (!sourceExtension.test(path) || privateName.test(path.split('/').at(-1) ?? '')) {
      makerFail(`read-context-not-source:${path}`);
    }
    validateProjectWritePath(root, path);
    if (!existsSync(join(root, path))) makerFail(`read-context-file-required:${path}`);
    readContainedRegularFile(root, path, 'maker read-only context');
  }
  const selected = [...new Set([...paths, ...input.readPaths, ...input.paths])].sort();
  if (selected.length > 128) makerFail('source-file-limit');
  return selected;
}

/** A projection, not a source-aware brief export. Original records remain byte-for-byte untouched. */
export function makerContext(root: string, route: RouteRecord, owner: Readonly<{
  input: MakerInput; invocation: ProjectRunInvocation;
}>) {
  const { input, invocation } = owner;
  const identities = new Set(loadRefs(root, { includeDomain: true }).map(ref => ref.source));
  const scrub = (text: string, literalDestination = false): string => {
    let result = text;
    for (const identity of identities) if (identity) result = result.replaceAll(identity, '[reference identity withheld]');
    return (literalDestination ? result : result.replace(/(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, '[external locator withheld]'))
      .replace(/(?:data:image\/[^\s"']+|iVBORw0KGgo[A-Za-z0-9+/=]+)/g, '[image payload withheld]')
      .replace(/(?:\.omd\/(?:refs|reference-research|reference-board|design-judgment|final-review)[^\s"'`)]*)/g, '[private evidence withheld]');
  };
  const project = (value: unknown, literalDestination = false): JsonValue => {
    if (typeof value === 'string') return scrub(value, literalDestination);
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (Array.isArray(value)) return value.map(item => project(item, literalDestination));
    if (typeof value !== 'object') return makerFail('projection-value');
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, project(item, literalDestination || key === 'entrySurface')]));
  };
  const read = (path: string) => readContainedRegularFile(root, path, 'maker contract');
  const documents: MakerDocument[] = [];
  const digests: Readonly<{ path: string; sha256: string }>[] = [];
  const contracts = [
    '.omd/functional-requirements.json', '.omd/copy-deck.md', '.omd/composition.md',
    '.omd/tokens.json', '.omd/content-grain.json', '.omd/task-flow-benchmark-projection.json',
    '.omd/design-system-decisions.md',
  ];
  for (const path of contracts.filter(path => existsSync(join(root, path)))) {
    const bytes = read(path);
    digests.push({ path, sha256: sha256(bytes) });
    const functional = path === '.omd/functional-requirements.json';
    const content = functional ? canonicalJson(parseFunctionalRequirements(JSON.parse(bytes.toString('utf8')))) : bytes.toString('utf8');
    documents.push({ path, content: scrub(content, functional) });
  }
  // Full type proofs contain alternatives and source rationale. Only the committed role contract crosses.
  if (route.strategy.stages.includes('type-proof') && existsSync(join(root, '.omd/type-proof.md'))) {
    const bytes = read('.omd/type-proof.md');
    digests.push({ path: '.omd/type-proof.md', sha256: sha256(bytes) });
    const sections = bytes.toString('utf8').split(/(?=^## )/m)
      .filter(section => /^## Approved type contract[ \t]*\r?\n/.test(section));
    if (sections.length !== 1) makerFail('approved-type-contract-required: Typesetter must write exactly one ## Approved type contract section in .omd/type-proof.md; read omd pack protocol/native-pi-completion.md without --section');
    documents.push({ path: 'approved-type-contract', content: scrub(sections.join('\n')) });
  }
  if (input.axis !== null) {
    const composition = documents.find(document => document.path === '.omd/composition.md')?.content ?? '';
    const axes = composition.split(/^## /m).find(section => section.startsWith('Candidate axes'));
    if (!axes?.includes(input.axis)) makerFail('axis-not-in-current-composition');
  }
  const frame = readFrame(root);
  const matrices = frame?.body.split(/^## Task coverage matrix[ \t]*$/m).slice(1)
    .map(section => (section.split(/^## /m)[0] ?? '').trim()) ?? [];
  if (matrices.length > 1 || matrices.some(matrix => validateTaskCoverageMatrix(matrix).length > 0)) {
    makerFail('task-coverage-matrix-invalid');
  }
  const frameContract = frame === null ? null : {
    uxTask: frame.uxTask, uxFrequentAction: frame.uxFrequentAction, uxCostliestError: frame.uxCostliestError,
    uxSurface: frame.uxSurface, reality: frame.reality, entrySurface: frame.entrySurface,
    taskCoverageMatrix: matrices[0] ?? null,
  };
  if (frame !== null) digests.push({ path: '.omd/frame.md', sha256: sha256(read('.omd/frame.md')) });
  const handoff = route.strategy.stages.includes('art-direction')
    ? readSelectedReferenceHandoff(root, input.role === 'omd-sketch' ? 'composer' : 'hand', {
      sourceContractSha256: route.sourceContractSha256, request: route.request,
    }) : null;
  const context = project({
    taskOutcome: route.sourceContract.taskOutcome,
    projectMode: route.projectMode, namedDependencies: route.namedDependencies,
    requiredOutcomes: route.requiredOutcomes, prohibitedOutcomes: route.prohibitedOutcomes,
    evidenceRequired: route.evidenceRequired,
    selectedStages: route.strategy.stages, skips: route.strategy.skips.map(skip => ({ id: skip.id })),
    designAxes: route.sourceContract.designAxes,
    locale: route.sourceContract.localeDesign?.context ?? null,
    frame: frameContract,
    designLanguage: projection(root, route),
    culturalDesign: route.sourceContract.localeDesign?.decision === 'research'
      ? readCurrentCulturalDesignProfile(root, invocation).projection : null,
    evaluatorPlan: route.gates.includes('greenfield-task-flow-benchmark')
      ? deriveTrustedEvaluationPlanFromProject({ root, invocation }) : null,
    transfer: handoff,
    axis: input.axis,
  });
  return {
    context, documents, digests,
    project,
    source(path: string): MakerDocument {
      const content = read(path).toString('utf8');
      if (Buffer.byteLength(content) > 1024 * 1024 || content.includes('\0')
        || [...identities].some(identity => identity && content.includes(identity))
        || /\.omd\/(?:refs|reference-research|briefs|final-review)\//.test(content)) {
        return makerFail(`source-context-not-first-party:${path}`);
      }
      return { path, content };
    },
    contextSha256: sha256(canonicalJson({ context, documents, digests })),
  };
}
