import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { validateTaskCoverageMatrix } from '../frame/check-ux.ts';
import { decodePng } from '../motion/energy.ts';
import { validateProbePlan, type ProbePlan, type ProbeResult } from '../probe/index.ts';
import { requireProductCaptureResultAuthorization, requireProductProbeResultAuthorization, validateCurrentProjectRun, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { acquireProjectLock, createProjectDirectory, replaceProjectFileAtomically, writeImmutableProjectFile } from '../runtime/project-write.ts';

export const TASK_EVIDENCE_SCHEMA_VERSION = 1;
/** The prior v1 shape did not bind a build or host-authorized captures. It is read-only. */
export const LEGACY_TASK_EVIDENCE_SCHEMA_VERSION = 1;
export interface TaskEvidence { schemaVersion: 1; buildSha256: string; surface: 'product' | 'mixed'; frame: Bound; composition: Bound; tasks: Task[]; }
export interface LegacyTaskEvidence { schemaVersion: 1; surface: 'product' | 'mixed'; frame: Bound; composition: Bound; tasks: LegacyTask[]; }
interface Bound { path: string; sha256: string }
type ProbeRole = 'primary' | 'recovery' | 'invalid-submit';
interface Probe { planPath: string; planSha256: string; resultPath: string; resultSha256: string; role: ProbeRole; viewport: Viewport }
type Viewport = 'desktop' | 'mobile';
interface CaptureAuthorization { schemaVersion: 1; buildSha256: string; executionId: string; taskId: string; route: string; target: string; viewport: Viewport; capturePath: string; captureSha256: string; role: 'render' | 'transient' }
interface Render { path: string; sha256: string; viewport: Viewport; authorization: CaptureAuthorization }
interface Transient { path: string; sha256: string; captureMode: 'settled' | 'reduced-motion'; probeRole: 'primary' | 'recovery'; stateSelector: string; stepIndex: number; viewport: Viewport; authorization: CaptureAuthorization }
interface LegacyRender { path: string; sha256: string; viewport: Viewport }
interface LegacyTransient { path: string; sha256: string; captureMode: 'settled' | 'reduced-motion'; probeRole: 'primary' | 'recovery'; stateSelector: string; stepIndex: number; viewport: Viewport }
interface Task { id: string; context: 'production'; production: { route: string; locator: string; workObject: string }; probes: Probe[]; renders: Render[]; invalidSubmit?: Probe; transient?: Transient[] }
interface LegacyTask { id: string; context: 'production'; production: Task['production']; probes: Probe[]; renders: LegacyRender[]; invalidSubmit?: Probe; transient?: LegacyTransient[] }
export interface ValidatedTaskEvidence extends TaskEvidence {
  readonly snapshot: Readonly<{ probes: readonly Readonly<{ taskId: string; role: ProbeRole; viewport: Viewport; target: string; resultSha256: string }>[]; captures: readonly Readonly<CaptureAuthorization>[] }>;
}
interface FrameRow { recovery: string; viewports: string; requirements: string }

const CACHE = '.omd/.cache/';
const SHA256 = /^[a-f0-9]{64}$/;
const RESERVED_ROUTE_SEGMENT = /(?:^|\/)(?:demo|storybook|showcase|fixture|demo[-_ ]fixture)(?:\/|$)/i;
const RESERVED_LABEL_TOKEN = /(?:^|[^a-z0-9])(?:showcase|storybook|demo[-_ ]fixture|fixture)(?=$|[^a-z0-9])/i;
const VIEWPORTS: Record<Viewport, { width: number; height: number }> = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
const compare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compare); const expected = [...keys].sort(compare);
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new Error(`${label} has unknown or missing keys`);
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value) throw new Error(`${label} must be a canonical non-empty string`);
  return value;
}
function path(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.includes('\\') || result.includes('\0') || result.startsWith('/') || /^[A-Za-z]:\//.test(result) || result.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`${label} must be a safe project-relative path`);
  return result;
}
function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}
function cachePath(value: unknown, label: string): string {
  const result = path(value, label);
  if (!result.startsWith(CACHE)) throw new Error(`${label} must be cache-only`);
  return result;
}
function rootOf(input: string): string {
  const root = resolve(input); const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('project root must be a non-symlink directory');
  return root;
}
function file(root: string, projectPath: string): string {
  const safe = path(projectPath, 'path'); const absolute = resolve(root, ...safe.split('/'));
  const rel = relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`path escapes project: ${projectPath}`);
  let current = root;
  for (const [index, part] of safe.split('/').entries()) {
    current = resolve(current, part); const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index === safe.split('/').length - 1 ? !stat.isFile() : !stat.isDirectory())) throw new Error(`not a regular project file: ${projectPath}`);
  }
  return absolute;
}
function stableProjectFile(root: string, projectPath: string, label: string): Buffer {
  const pathname = file(root, projectPath);
  const before = lstatSync(pathname);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const descriptor = openSync(pathname, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const descriptorBefore = fstatSync(descriptor);
    if (descriptorBefore.dev !== before.dev || descriptorBefore.ino !== before.ino || descriptorBefore.size !== before.size || descriptorBefore.mtimeMs !== before.mtimeMs || descriptorBefore.ctimeMs !== before.ctimeMs) throw new Error(`${label} changed before stable read`);
    const bytes = Buffer.alloc(descriptorBefore.size);
    for (let offset = 0; offset < bytes.length;) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (read === 0) throw new Error(`${label} changed during stable read`);
      offset += read;
    }
    const descriptorAfter = fstatSync(descriptor);
    const after = lstatSync(pathname);
    for (const stat of [descriptorAfter, after]) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== descriptorBefore.dev || stat.ino !== descriptorBefore.ino || stat.size !== descriptorBefore.size || stat.mtimeMs !== descriptorBefore.mtimeMs || stat.ctimeMs !== descriptorBefore.ctimeMs) throw new Error(`${label} changed during stable read`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('canonical JSON rejects non-finite numbers'); return Object.is(value, -0) ? '0' : JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isRecord(value)) throw new Error('canonical JSON rejects unsupported values');
  return `{${Object.keys(value).sort(compare).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function bound(value: unknown, label: string, expected: string): Bound {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['path', 'sha256'], label);
  if (value.path !== expected) throw new Error(`${label}.path must be ${expected}`);
  return { path: expected, sha256: hash(value.sha256, `${label}.sha256`) };
}
function parseProbe(value: unknown, label: string, roles: readonly ProbeRole[]): Probe {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['planPath', 'planSha256', 'resultPath', 'resultSha256', 'role', 'viewport'], label);
  if (typeof value.role !== 'string' || !roles.includes(value.role as ProbeRole)) throw new Error(`${label}.role is invalid`);
  if (value.viewport !== 'desktop' && value.viewport !== 'mobile') throw new Error(`${label}.viewport is invalid`);
  return { planPath: cachePath(value.planPath, `${label}.planPath`), planSha256: hash(value.planSha256, `${label}.planSha256`), resultPath: cachePath(value.resultPath, `${label}.resultPath`), resultSha256: hash(value.resultSha256, `${label}.resultSha256`), role: value.role as ProbeRole, viewport: value.viewport };
}
function parseCaptureAuthorization(value: unknown, label: string): CaptureAuthorization {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['schemaVersion', 'buildSha256', 'executionId', 'taskId', 'route', 'target', 'viewport', 'capturePath', 'captureSha256', 'role'], label);
  const viewport = value.viewport;
  const role = value.role;
  if (value.schemaVersion !== 1 || (viewport !== 'desktop' && viewport !== 'mobile') || (role !== 'render' && role !== 'transient')) throw new Error(`${label} is invalid`);
  const route = string(value.route, `${label}.route`);
  if (!route.startsWith('/') || /^\/\//.test(route)) throw new Error(`${label}.route is invalid`);
  const authorization: CaptureAuthorization = {
    schemaVersion: 1,
    buildSha256: hash(value.buildSha256, `${label}.buildSha256`),
    executionId: string(value.executionId, `${label}.executionId`),
    taskId: string(value.taskId, `${label}.taskId`),
    route,
    target: string(value.target, `${label}.target`),
    viewport,
    capturePath: cachePath(value.capturePath, `${label}.capturePath`),
    captureSha256: hash(value.captureSha256, `${label}.captureSha256`),
    role,
  };
  localProductionTarget(authorization.target, authorization.route);
  return authorization;
}
function parseRender(value: unknown, label: string): Render {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['path', 'sha256', 'viewport', 'authorization'], label);
  if (value.viewport !== 'desktop' && value.viewport !== 'mobile') throw new Error(`${label}.viewport is invalid`);
  return { path: cachePath(value.path, `${label}.path`), sha256: hash(value.sha256, `${label}.sha256`), viewport: value.viewport, authorization: parseCaptureAuthorization(value.authorization, `${label}.authorization`) };
}
function parseTransient(value: unknown, label: string): Transient {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['path', 'sha256', 'captureMode', 'probeRole', 'stateSelector', 'stepIndex', 'viewport', 'authorization'], label);
  if (value.captureMode !== 'settled' && value.captureMode !== 'reduced-motion') throw new Error(`${label}.captureMode is invalid`);
  if (value.probeRole !== 'primary' && value.probeRole !== 'recovery') throw new Error(`${label}.probeRole is invalid`);
  if (value.viewport !== 'desktop' && value.viewport !== 'mobile') throw new Error(`${label}.viewport is invalid`);
  const stepIndex = value.stepIndex;
  if (typeof stepIndex !== 'number' || !Number.isSafeInteger(stepIndex) || stepIndex < 0) throw new Error(`${label}.stepIndex is invalid`);
  const artifactPath = cachePath(value.path, `${label}.path`);
  if (!artifactPath.endsWith('.png')) throw new Error(`${label}.path must be a PNG`);
  return { path: artifactPath, sha256: hash(value.sha256, `${label}.sha256`), captureMode: value.captureMode, probeRole: value.probeRole, stateSelector: string(value.stateSelector, `${label}.stateSelector`), stepIndex, viewport: value.viewport, authorization: parseCaptureAuthorization(value.authorization, `${label}.authorization`) };
}
function parseLegacyRender(value: unknown, label: string): LegacyRender {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['path', 'sha256', 'viewport'], label);
  if (value.viewport !== 'desktop' && value.viewport !== 'mobile') throw new Error(`${label}.viewport is invalid`);
  return { path: cachePath(value.path, `${label}.path`), sha256: hash(value.sha256, `${label}.sha256`), viewport: value.viewport };
}
function parseLegacyTransient(value: unknown, label: string): LegacyTransient {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['path', 'sha256', 'captureMode', 'probeRole', 'stateSelector', 'stepIndex', 'viewport'], label);
  if (value.captureMode !== 'settled' && value.captureMode !== 'reduced-motion') throw new Error(`${label}.captureMode is invalid`);
  if (value.probeRole !== 'primary' && value.probeRole !== 'recovery') throw new Error(`${label}.probeRole is invalid`);
  if (value.viewport !== 'desktop' && value.viewport !== 'mobile') throw new Error(`${label}.viewport is invalid`);
  const stepIndex = value.stepIndex;
  if (typeof stepIndex !== 'number' || !Number.isSafeInteger(stepIndex) || stepIndex < 0) throw new Error(`${label}.stepIndex is invalid`);
  const artifactPath = cachePath(value.path, `${label}.path`);
  if (!artifactPath.endsWith('.png')) throw new Error(`${label}.path must be a PNG`);
  return { path: artifactPath, sha256: hash(value.sha256, `${label}.sha256`), captureMode: value.captureMode, probeRole: value.probeRole, stateSelector: string(value.stateSelector, `${label}.stateSelector`), stepIndex, viewport: value.viewport };
}
function reservedProductionTarget(production: Task['production']): boolean {
  return RESERVED_ROUTE_SEGMENT.test(production.route) || RESERVED_LABEL_TOKEN.test(production.locator) || RESERVED_LABEL_TOKEN.test(production.workObject);
}
function parseTask(value: unknown, index: number): Task {
  const label = `tasks[${index}]`; if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const allowed = ['id', 'context', 'production', 'probes', 'renders', 'invalidSubmit', 'transient'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} has unknown keys`);
  if (!Array.isArray(value.probes) || !Array.isArray(value.renders) || !isRecord(value.production) || value.context !== 'production') throw new Error(`${label} is invalid`);
  exact(value.production, ['route', 'locator', 'workObject'], `${label}.production`);
  const production = { route: string(value.production.route, `${label}.production.route`), locator: string(value.production.locator, `${label}.production.locator`), workObject: string(value.production.workObject, `${label}.production.workObject`) };
  if (!production.route.startsWith('/') || /^\/\//.test(production.route) || reservedProductionTarget(production)) throw new Error(`${label} must identify a local non-demo production target`);
  const probes = value.probes.map((item, n) => parseProbe(item, `${label}.probes[${n}]`, ['primary', 'recovery']));
  const renders = value.renders.map((item, n) => parseRender(item, `${label}.renders[${n}]`));
  if (!probes.some(item => item.role === 'primary') || new Set(probes.map(item => `${item.role}:${item.viewport}`)).size !== probes.length) throw new Error(`${label} requires unique role and viewport probe executions`);
  if (!renders.length || new Set(renders.map(item => item.viewport)).size !== renders.length) throw new Error(`${label}.renders must have unique viewports`);
  const invalidSubmit = value.invalidSubmit === undefined ? undefined : parseProbe(value.invalidSubmit, `${label}.invalidSubmit`, ['invalid-submit']);
  if (value.transient !== undefined && (!Array.isArray(value.transient) || !value.transient.length)) throw new Error(`${label}.transient must be non-empty`);
  const transient = value.transient?.map((item, n) => parseTransient(item, `${label}.transient[${n}]`));
  const id = string(value.id, `${label}.id`);
  if (!/^T[1-9]\d*$/.test(id)) throw new Error(`${label}.id is invalid`);
  const captures = [...renders.map(render => render.authorization), ...(transient ?? []).map(artifact => artifact.authorization)];
  for (const [captureIndex, capture] of captures.entries()) {
    const artifact = [...renders, ...(transient ?? [])][captureIndex]!;
    const expectedRole = captureIndex < renders.length ? 'render' : 'transient';
    if (capture.taskId !== id || capture.route !== production.route || capture.target !== `http://localhost${production.route}` || capture.viewport !== artifact.viewport || capture.capturePath !== artifact.path || capture.captureSha256 !== artifact.sha256 || capture.role !== expectedRole) {
      throw new Error(`${label} capture authorization does not bind the exact production task artifact`);
    }
  }
  return { id, context: 'production', production, probes, renders, ...(invalidSubmit ? { invalidSubmit } : {}), ...(transient ? { transient } : {}) };
}
function parseLegacyTask(value: unknown, index: number): LegacyTask {
  const label = `tasks[${index}]`; if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const allowed = ['id', 'context', 'production', 'probes', 'renders', 'invalidSubmit', 'transient'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} has unknown keys`);
  if (!Array.isArray(value.probes) || !Array.isArray(value.renders) || !isRecord(value.production) || value.context !== 'production') throw new Error(`${label} is invalid`);
  exact(value.production, ['route', 'locator', 'workObject'], `${label}.production`);
  const production = { route: string(value.production.route, `${label}.production.route`), locator: string(value.production.locator, `${label}.production.locator`), workObject: string(value.production.workObject, `${label}.production.workObject`) };
  if (!production.route.startsWith('/') || /^\/\//.test(production.route) || reservedProductionTarget(production)) throw new Error(`${label} must identify a local non-demo production target`);
  const probes = value.probes.map((item, n) => parseProbe(item, `${label}.probes[${n}]`, ['primary', 'recovery']));
  const renders = value.renders.map((item, n) => parseLegacyRender(item, `${label}.renders[${n}]`));
  if (!probes.some(item => item.role === 'primary') || new Set(probes.map(item => `${item.role}:${item.viewport}`)).size !== probes.length) throw new Error(`${label} requires unique role and viewport probe executions`);
  if (!renders.length || new Set(renders.map(item => item.viewport)).size !== renders.length) throw new Error(`${label}.renders must have unique viewports`);
  const invalidSubmit = value.invalidSubmit === undefined ? undefined : parseProbe(value.invalidSubmit, `${label}.invalidSubmit`, ['invalid-submit']);
  if (value.transient !== undefined && (!Array.isArray(value.transient) || !value.transient.length)) throw new Error(`${label}.transient must be non-empty`);
  const transient = value.transient?.map((item, n) => parseLegacyTransient(item, `${label}.transient[${n}]`));
  const id = string(value.id, `${label}.id`);
  if (!/^T[1-9]\d*$/.test(id)) throw new Error(`${label}.id is invalid`);
  return { id, context: 'production', production, probes, renders, ...(invalidSubmit ? { invalidSubmit } : {}), ...(transient ? { transient } : {}) };
}
function parseLegacyManifest(value: unknown): LegacyTaskEvidence {
  if (!isRecord(value)) throw new Error('legacy task evidence manifest must be an object');
  exact(value, ['schemaVersion', 'surface', 'frame', 'composition', 'tasks'], 'legacy task evidence manifest');
  if (value.schemaVersion !== LEGACY_TASK_EVIDENCE_SCHEMA_VERSION || (value.surface !== 'product' && value.surface !== 'mixed') || !Array.isArray(value.tasks)) throw new Error('legacy task evidence manifest is invalid');
  const tasks = value.tasks.map(parseLegacyTask);
  if (!tasks.length || new Set(tasks.map(task => task.id)).size !== tasks.length || new Set(tasks.map(task => task.production.locator)).size !== tasks.length) throw new Error('legacy task ids and production locators must be globally unique');
  return { schemaVersion: LEGACY_TASK_EVIDENCE_SCHEMA_VERSION, surface: value.surface, frame: bound(value.frame, 'frame', '.omd/frame.md'), composition: bound(value.composition, 'composition', '.omd/composition.md'), tasks };
}

/** Parses the exact task-evidence v1 bytes emitted before build/capture authorization bindings. */
export function parseLegacyTaskEvidenceRecord(bytes: Uint8Array | string): LegacyTaskEvidence {
  const source = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('legacy task evidence record must be valid JSON'); }
  return freeze(parseLegacyManifest(value));
}

function parseManifest(value: unknown): TaskEvidence {
  if (!isRecord(value)) throw new Error('task evidence manifest must be an object');
  exact(value, ['schemaVersion', 'buildSha256', 'surface', 'frame', 'composition', 'tasks'], 'task evidence manifest');
  const surface = value.surface;
  if (value.schemaVersion !== 1 || (surface !== 'product' && surface !== 'mixed') || !Array.isArray(value.tasks)) throw new Error('task evidence manifest is invalid');
  const tasks = value.tasks.map(parseTask);
  if (!tasks.length || new Set(tasks.map(task => task.id)).size !== tasks.length || new Set(tasks.map(task => task.production.locator)).size !== tasks.length) throw new Error('task ids and production locators must be globally unique');
  const probeUses = new Map<string, string>();
  for (const task of tasks) {
    for (const probe of [...task.probes, ...(task.invalidSubmit === undefined ? [] : [task.invalidSubmit])]) {
      for (const key of [`path:${probe.resultPath}`, `sha256:${probe.resultSha256}`]) {
        const existing = probeUses.get(key);
        if (existing !== undefined && existing !== task.id) throw new Error('probe execution or result cannot be reused across tasks');
        probeUses.set(key, task.id);
      }
    }
  }
  if (surface === 'mixed' && new Set(tasks.map(task => task.production.route)).size < 2) throw new Error('mixed task evidence requires at least two distinct production routes');
  const evidence: TaskEvidence = { schemaVersion: 1, buildSha256: hash(value.buildSha256, 'buildSha256'), surface, frame: bound(value.frame, 'frame', '.omd/frame.md'), composition: bound(value.composition, 'composition', '.omd/composition.md'), tasks };
  const captureBindings = evidence.tasks.flatMap(task => [...task.renders.map(render => render.authorization), ...(task.transient ?? []).map(capture => capture.authorization)]);
  if (captureBindings.some(capture => capture.buildSha256 !== evidence.buildSha256)) throw new Error('capture authorization build SHA-256 does not match task evidence');
  const captureUses = new Map<string, string>();
  for (const capture of captureBindings) {
    const binding = `${capture.taskId}:${capture.role}`;
    for (const key of [`execution:${capture.executionId}`, `path:${capture.capturePath}`]) {
      const existing = captureUses.get(key);
      if (existing !== undefined && existing !== binding) throw new Error('capture execution or path cannot be reused across tasks or capture roles');
      captureUses.set(key, binding);
    }
  }
  return evidence;
}
function frameRows(bytes: Buffer, surface: TaskEvidence['surface']): Map<string, FrameRow> {
  const source = bytes.toString('utf8'); const front = /^---\n([\s\S]*?)\n---/.exec(source); const frontmatter = front?.[1] === undefined ? {} : parse(front[1]);
  if (!isRecord(frontmatter) || frontmatter.uxSurface !== surface) throw new Error(`frame uxSurface must be ${surface}`);
  const sections = source.split(/^## Task coverage matrix[ \t]*$/gm).slice(1).map(part => part.split(/^## /m)[0] ?? ''); const section = sections[0];
  if (sections.length !== 1 || section === undefined) throw new Error('frame must have exactly one task coverage matrix');
  const errors = validateTaskCoverageMatrix(section); if (errors.length) throw new Error(`invalid frame task coverage matrix: ${errors.join('; ')}`);
  const rows = new Map<string, FrameRow>();
  for (const row of section.split('\n').map(row => row.trim()).filter(Boolean)) {
    const cells = row.split('|').map(cell => cell.trim()); const id = cells.shift(); if (!id) throw new Error(`malformed frame task coverage row: ${row}`);
    const fields = new Map<string, string>();
    for (const cell of cells) { const match = /^(goal|start|actions|success|recovery|viewports|requirements):\s*(.+)$/.exec(cell); if (!match?.[1] || !match[2]) throw new Error(`malformed frame task coverage row: ${row}`); fields.set(match[1], match[2]); }
    const recovery = fields.get('recovery'); const viewports = fields.get('viewports'); const requirements = fields.get('requirements');
    if (recovery === undefined || viewports === undefined || requirements === undefined) throw new Error(`malformed frame task coverage row: ${row}`); rows.set(id, { recovery, viewports, requirements });
  }
  return rows;
}
function coverage(bytes: Buffer): Map<string, { route: string; locator: string }> {
  const sections = bytes.toString('utf8').split(/^## UX task coverage[ \t]*$/gm).slice(1).map(part => part.split(/^## /m)[0] ?? ''); const section = sections[0];
  if (sections.length !== 1 || section === undefined) throw new Error('composition must have exactly one ## UX task coverage section');
  const rows = new Map<string, { route: string; locator: string }>();
  for (const row of section.split('\n').map(line => line.trim()).filter(Boolean)) {
    const match = /^(T[1-9]\d*)\s*\|\s*production:\s*(\/[^|\s]*)\s*\|\s*locator:\s*(\S+)\s*\|?\s*$/.exec(row);
    if (!match?.[1] || !match[2] || !match[3] || rows.has(match[1])) throw new Error(`malformed composition UX task coverage row: ${row}`);
    rows.set(match[1], { route: match[2], locator: match[3] });
  }
  return rows;
}
function expectationMatches(expected: NonNullable<ProbePlan['steps'][number]['expect']>[number], observed: ProbeResult['steps'][number]['expectations'][number]): boolean {
  if (observed.type !== expected.type || !observed.ok) return false;
  if (expected.type === 'url') return observed.value === expected.value;
  if (observed.selector !== expected.selector) return false;
  if (expected.type === 'visible' || expected.type === 'hidden') return true;
  if (expected.type === 'text') return observed.value === expected.value;
  if (expected.type !== 'attribute') return false;
  return observed.name === expected.name && observed.value === expected.value;
}
function localProductionTarget(target: string, route: string): void {
  let url: URL; try { url = new URL(target); } catch { throw new Error('probe target must be a localhost HTTP URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== route || url.search || url.hash) throw new Error('probe result does not bind an exact localhost production route');
}
function activationIndex(plan: ProbePlan, locator: string): number {
  return plan.steps.findIndex(step => (step.action === 'click' || step.action === 'press') && step.selector === locator);
}
function activationStep(plan: ProbePlan, result: ProbeResult, locator: string): { index: number; expectations: NonNullable<ProbePlan['steps'][number]['expect']> } {
  const index = activationIndex(plan, locator);
  if (index < 0) throw new Error('probe activation must use the production locator');
  const expectations = plan.steps[index]!.expect ?? [];
  const observed = result.steps[index]!;
  if (!expectations.some((expectation, expectationIndex) => expectationMatches(expectation, observed.expectations[expectationIndex]!))) {
    throw new Error('probe activation requires a successful observable');
  }
  return { index, expectations };
}
function verifyProbe(root: string, evidence: Probe, task: Task): ProbeResult {
  const planBytes = stableProjectFile(root, evidence.planPath, `probe plan for ${task.id}`); const resultBytes = stableProjectFile(root, evidence.resultPath, `probe result for ${task.id}`);
  if (digest(planBytes) !== evidence.planSha256 || digest(resultBytes) !== evidence.resultSha256) throw new Error(`probe digest mismatch for ${task.id}`);
  const plan = validateProbePlan(JSON.parse(planBytes.toString('utf8'))); const result = JSON.parse(resultBytes.toString('utf8')) as ProbeResult;
  localProductionTarget(result.target, task.production.route);
  const viewport = VIEWPORTS[evidence.viewport];
  if (result.name !== plan.name || result.viewport?.width !== viewport.width || result.viewport?.height !== viewport.height || !Array.isArray(result.steps) || result.steps.length !== plan.steps.length || !Array.isArray(result.warnings) || result.warnings.some(warning => warning.id === 'PROBE-DEAD-CONTROL')) throw new Error(`probe result does not bind a successful local task route: ${task.id}`);
  for (const [index, step] of plan.steps.entries()) {
    const actual = result.steps[index]!; const expected = step.expect ?? [];
    if (actual.action !== step.action || actual.selector !== step.selector || actual.key !== step.key || !actual.ok || actual.expectations.length !== expected.length) throw new Error(`probe result does not match plan: ${task.id}`);
    for (const [n, expectation] of expected.entries()) if (!expectationMatches(expectation, actual.expectations[n]!)) throw new Error(`probe expectation failed or differs from plan: ${task.id}`);
  }
  activationStep(plan, result, task.production.locator);
  return result;
}
function verifyInvalidSubmit(root: string, evidence: Probe, task: Task): ProbeResult {
  const result = verifyProbe(root, evidence, task); const plan = validateProbePlan(JSON.parse(stableProjectFile(root, evidence.planPath, `probe plan for ${task.id}`).toString('utf8')));
  for (const [fillIndex, fill] of plan.steps.entries()) {
    if (fill.action !== 'fill') continue;
    const activation = plan.steps.findIndex((step, index) => index > fillIndex && (step.action === 'click' || step.action === 'press') && step.selector === task.production.locator);
    if (activation < 0) continue;
    const observed = result.steps[activation]!;
    const expectations = plan.steps[activation]!.expect ?? [];
    const error = expectations.some((expectation, index) => (expectation.type === 'visible' || expectation.type === 'text') && expectationMatches(expectation, observed.expectations[index]!) && /error|invalid|required|must/i.test(expectation.type === 'text' ? expectation.value : expectation.selector));
    const preserved = expectations.some((expectation, index) => expectation.type === 'attribute' && expectation.selector === fill.selector && expectation.name === 'value' && expectation.value === fill.value && expectationMatches(expectation, observed.expectations[index]!));
    if (error && preserved) return result;
  }
  throw new Error(`invalid-submit evidence must fill, activate the production locator, then expose an actionable error and preserved value: ${task.id}`);
}
function verifyPng(bytes: Buffer, expected: { width: number; height: number }, label: string): ReturnType<typeof decodePng> {
  const png = decodePng(bytes);
  if (png.width !== expected.width || png.height !== expected.height) throw new Error(`${label} must have exact ${expected.width}x${expected.height} viewport pixels`);
  return png;
}
function hasMeaningfulVisibleVariation(png: ReturnType<typeof decodePng>): boolean {
  const total = png.width * png.height;
  const colors = new Map<string, number>();
  const visible = new Uint8Array(total);
  const colorAt = (index: number): string => {
    const offset = index * png.channels;
    const alpha = png.channels === 4 ? png.pixels[offset + 3]! : 255;
    if (alpha === 0) return '';
    visible[index] = 1;
    return [0, 1, 2].map(channel => Math.round(png.pixels[offset + channel]! * alpha / 255)).join(',');
  };
  for (let index = 0; index < total; index += 1) { const color = colorAt(index); if (color) colors.set(color, (colors.get(color) ?? 0) + 1); }
  const dominant = [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const required = Math.ceil(visible.reduce((sum, value) => sum + value, 0) * 0.005);
  const seen = new Uint8Array(total);
  for (let start = 0; start < total; start += 1) {
    if (!visible[start] || seen[start] || colorAt(start) === dominant) continue;
    const queue = [start]; seen[start] = 1; let size = 0; let minX = png.width; let maxX = 0; let minY = png.height; let maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!; const x = index % png.width; const y = Math.floor(index / png.width); size += 1; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const next of [index - 1, index + 1, index - png.width, index + png.width]) if (next >= 0 && next < total && Math.abs((next % png.width) - x) + Math.abs(Math.floor(next / png.width) - y) === 1 && visible[next] && !seen[next] && colorAt(next) !== dominant) { seen[next] = 1; queue.push(next); }
    }
    if (size >= required && size / ((maxX - minX + 1) * (maxY - minY + 1)) >= 0.25) return true;
  }
  return false;
}
function verifyTransient(root: string, task: Task, results: Map<string, ProbeResult>): void {
  for (const artifact of task.transient ?? []) {
    const bytes = stableProjectFile(root, artifact.path, `transient evidence for ${task.id}`); if (digest(bytes) !== artifact.sha256) throw new Error(`transient digest mismatch: ${task.id}`);
    const result = results.get(`${artifact.probeRole}:${artifact.viewport}`); if (!result) throw new Error(`transient must bind an existing ${artifact.probeRole} probe: ${task.id}`);
    const viewport = VIEWPORTS[artifact.viewport];
    const probe = task.probes.find(item => item.role === artifact.probeRole && item.viewport === artifact.viewport)!;
    const plan = validateProbePlan(JSON.parse(stableProjectFile(root, probe.planPath, `probe plan for ${task.id}`).toString('utf8')));
    const step = plan.steps[artifact.stepIndex]; const observed = result.steps[artifact.stepIndex];
    if (!step || !observed || (step.action !== 'click' && step.action !== 'press') || step.selector !== task.production.locator) throw new Error(`transient state must be a successful production activation observable: ${task.id}`);
    const matchesState = (step.expect ?? []).some((expectation, index) => expectation.type !== 'url' && expectation.selector === artifact.stateSelector && expectationMatches(expectation, observed.expectations[index]!));
    if (!matchesState) throw new Error(`transient state must be a successful production activation observable: ${task.id}`);
    if (!hasMeaningfulVisibleVariation(verifyPng(bytes, viewport, `transient evidence for ${task.id}`))) throw new Error(`transient evidence must contain meaningful coherent visible PNG pixels: ${task.id}`);
  }
}
function verify(root: string, evidence: TaskEvidence, sources?: Readonly<{ frame: Buffer; composition: Buffer }>): readonly Readonly<{ taskId: string; role: ProbeRole; viewport: Viewport; target: string; resultSha256: string }>[] {
  const probeSnapshots: Readonly<{ taskId: string; role: ProbeRole; viewport: Viewport; target: string; resultSha256: string }>[] = [];
  const frame = sources?.frame ?? stableProjectFile(root, evidence.frame.path, 'frame');
  const composition = sources?.composition ?? stableProjectFile(root, evidence.composition.path, 'composition');
  if (digest(frame) !== evidence.frame.sha256 || digest(composition) !== evidence.composition.sha256) {
    throw new Error('frame or composition digest mismatch');
  }

  const rows = frameRows(frame, evidence.surface);
  const compositionCoverage = coverage(composition);
  const ids = evidence.tasks.map(task => task.id);
  if (rows.size !== ids.length || compositionCoverage.size !== ids.length || ids.some(id => !rows.has(id) || !compositionCoverage.has(id))) {
    throw new Error('task evidence must match the exact frame and composition task sets');
  }

  for (const task of evidence.tasks) {
    const row = rows.get(task.id)!;
    const covered = compositionCoverage.get(task.id)!;
    if (covered.route !== task.production.route || covered.locator !== task.production.locator) {
      throw new Error(`composition coverage does not bind production task: ${task.id}`);
    }
    if ((!/^N\/A\b/i.test(row.recovery)) !== task.probes.some(probe => probe.role === 'recovery')) {
      throw new Error(`recovery evidence does not match frame: ${task.id}`);
    }
    if (/\binvalid-submit\b/i.test(row.requirements) !== Boolean(task.invalidSubmit) || /\btransient\b/i.test(row.requirements) !== Boolean(task.transient)) {
      throw new Error(`task evidence requirements do not match frame: ${task.id}`);
    }

    const requiredViewports: Viewport[] = [];
    if (/\bdesktop\b/i.test(row.viewports)) requiredViewports.push('desktop');
    if (/\bmobile\b/i.test(row.viewports)) requiredViewports.push('mobile');
    const primary = task.probes.filter(probe => probe.role === 'primary');
    const recovery = task.probes.filter(probe => probe.role === 'recovery');
    for (const viewport of requiredViewports) {
      if (primary.filter(probe => probe.viewport === viewport).length !== 1) throw new Error(`primary probe must cover required ${viewport} viewport: ${task.id}`);
      if (recovery.length && recovery.filter(probe => probe.viewport === viewport).length !== 1) throw new Error(`recovery probe must cover required ${viewport} viewport: ${task.id}`);
    }
    if (task.invalidSubmit && !requiredViewports.includes(task.invalidSubmit.viewport)) throw new Error(`invalid-submit probe must use a required viewport: ${task.id}`);
    for (const recoveryProbe of recovery) {
      if (primary.some(probe => probe.viewport === recoveryProbe.viewport && (probe.planPath === recoveryProbe.planPath || probe.planSha256 === recoveryProbe.planSha256 || probe.resultPath === recoveryProbe.resultPath || probe.resultSha256 === recoveryProbe.resultSha256))) throw new Error(`recovery plan and result must be distinct from primary: ${task.id}`);
    }

    const results = new Map<string, ProbeResult>();
    for (const probe of [...primary, ...recovery]) {
      const result = verifyProbe(root, probe, task);
      probeSnapshots.push(Object.freeze({ taskId: task.id, role: probe.role, viewport: probe.viewport, target: result.target, resultSha256: probe.resultSha256 }));
      results.set(`${probe.role}:${probe.viewport}`, result);
    }
    if (task.invalidSubmit) {
      const result = verifyInvalidSubmit(root, task.invalidSubmit, task);
      probeSnapshots.push(Object.freeze({ taskId: task.id, role: task.invalidSubmit.role, viewport: task.invalidSubmit.viewport, target: result.target, resultSha256: task.invalidSubmit.resultSha256 }));
    }

    for (const render of task.renders) {
      const bytes = stableProjectFile(root, render.path, `render evidence for ${task.id}`);
      if (!render.path.endsWith('.png') || digest(bytes) !== render.sha256) {
        throw new Error(`render digest or format mismatch: ${task.id}`);
      }
      verifyPng(bytes, VIEWPORTS[render.viewport], `render evidence for ${task.id}`);
    }

    const hasDesktop = task.renders.some(render => render.viewport === 'desktop');
    const hasMobile = task.renders.some(render => render.viewport === 'mobile');
    if (!hasDesktop || (/\bmobile\b/i.test(row.viewports) && !hasMobile) || (/\bdesktop\b/i.test(row.viewports) && !hasDesktop)) {
      throw new Error(`required viewport evidence is missing: ${task.id}`);
    }
    verifyTransient(root, task, results);
  }
  return Object.freeze(probeSnapshots);
}
export function requireTaskEvidenceProbeAuthorizations(rootInput: string, evidence: TaskEvidence, invocation: ProjectRunInvocation): void {
  const root = rootOf(rootInput);
  validateCurrentProjectRun(invocation);
  if (evidence.buildSha256 !== invocation.current.buildSha256) {
    throw new Error('task evidence build SHA-256 does not match the fresh invocation');
  }
  for (const task of evidence.tasks) {
    for (const probe of [...task.probes, ...(task.invalidSubmit === undefined ? [] : [task.invalidSubmit])]) {
      const resultBytes = stableProjectFile(root, probe.resultPath, `probe result for ${task.id}`);
      if (digest(resultBytes) !== probe.resultSha256) throw new Error(`authorized probe digest mismatch for ${task.id}`);
      requireProductProbeResultAuthorization(invocation, root, resultBytes);
    }
    for (const capture of [...task.renders, ...(task.transient ?? [])]) {
      requireProductCaptureResultAuthorization(invocation, root, Buffer.from(canonical(capture.authorization)));
    }
  }
}

function regularFile(pathname: string, label: string): void {
  const stat = lstatSync(pathname);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
}
function projectRelative(root: string, pathname: string): string {
  const result = relative(root, pathname).split(sep).join('/');
  return path(result, 'project write path');
}
function acquirePublicationLock(root: string, invocation: ProjectRunInvocation): () => void {
  try {
    return acquireProjectLock({ projectRoot: root, relativePath: '.omd/.task-evidence.lock', invocation });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('project lock already exists:')) {
      throw new Error('task evidence publication lock already exists');
    }
    throw error;
  }
}
function publishImmutable(root: string, pathname: string, bytes: Buffer, invocation: ProjectRunInvocation): void {
  try {
    writeImmutableProjectFile({ projectRoot: root, relativePath: projectRelative(root, pathname), content: bytes, invocation });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes('immutable project artifact already exists:'))) throw error;
  }
  regularFile(pathname, 'task evidence immutable record');
  if (!readFileSync(pathname).equals(bytes)) throw new Error('task evidence immutable record bytes differ');
}
function requireCurrentRecord(pathname: string): void {
  try {
    regularFile(pathname, 'current record');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function publishCurrent(root: string, output: string, bytes: Buffer, invocation: ProjectRunInvocation): void {
  requireCurrentRecord(output);
  replaceProjectFileAtomically({ projectRoot: root, relativePath: projectRelative(root, output), content: bytes, invocation });
  regularFile(output, 'task evidence current record');
  if (!readFileSync(output).equals(bytes)) throw new Error('task evidence current record bytes differ');
}
export function publishTaskEvidence(rootInput: string, input: string, invocation: ProjectRunInvocation): string {
  const root = rootOf(rootInput);
  const relativeInput = relative(root, resolve(input)).split(sep).join('/');
  if (!relativeInput.startsWith(CACHE)) throw new Error(`task evidence manifest must be cache-only: ${CACHE}`);
  const releasePublicationLock = acquirePublicationLock(root, invocation);
  try {
    const manifest = file(root, relativeInput);
    const manifestBytes = readFileSync(manifest);
    const evidence = parseManifest(JSON.parse(manifestBytes.toString('utf8')));
    verify(root, evidence);
    requireTaskEvidenceProbeAuthorizations(root, evidence, invocation);
    const bytes = Buffer.from(`${canonical(evidence)}\n`);
    createProjectDirectory(root, '.omd', invocation);
    createProjectDirectory(root, '.omd/task-evidence-runs', invocation);
    const omd = resolve(root, '.omd');
    const runs = resolve(root, '.omd/task-evidence-runs');
    const immutable = resolve(runs, `${digest(bytes)}.json`);
    const output = resolve(omd, 'task-evidence.json');
    publishImmutable(root, immutable, bytes, invocation);

    regularFile(manifest, 'manifest');
    if (!readFileSync(manifest).equals(manifestBytes)) {
      throw new Error('task evidence manifest changed during publication');
    }
    const currentEvidence = parseManifest(JSON.parse(manifestBytes.toString('utf8')));
    verify(root, currentEvidence);
    requireTaskEvidenceProbeAuthorizations(root, currentEvidence, invocation);
    const currentBytes = Buffer.from(`${canonical(currentEvidence)}\n`);
    if (!currentBytes.equals(bytes)) throw new Error('task evidence bindings changed during publication');
    publishCurrent(root, output, currentBytes, invocation);
    return output;
  } finally {
    releasePublicationLock();
  }
}
function checkTaskEvidenceWithSources(rootInput: string, sources?: Readonly<{ frame: Buffer; composition: Buffer }>): ValidatedTaskEvidence {
  const root = rootOf(rootInput);
  const bytes = stableProjectFile(root, '.omd/task-evidence.json', 'current task evidence record');
  const evidence = parseManifest(JSON.parse(bytes.toString('utf8')));

  let immutableBytes: Buffer;
  try {
    immutableBytes = stableProjectFile(root, `.omd/task-evidence-runs/${digest(bytes)}.json`, 'immutable task evidence record');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('task evidence immutable publication is missing');
    throw error;
  }
  if (!bytes.equals(immutableBytes)) throw new Error('task evidence current record does not match immutable publication');

  const probes = verify(root, evidence, sources);
  if (!stableProjectFile(root, '.omd/task-evidence.json', 'current task evidence record').equals(bytes) || !stableProjectFile(root, `.omd/task-evidence-runs/${digest(bytes)}.json`, 'immutable task evidence record').equals(immutableBytes)) {
    throw new Error('task evidence current or immutable record drifted during validation');
  }
  const captures = Object.freeze(evidence.tasks.flatMap(task => [...task.renders.map(render => freeze({ ...render.authorization })), ...(task.transient ?? []).map(capture => freeze({ ...capture.authorization }))]));
  Object.defineProperty(evidence, 'snapshot', { value: Object.freeze({ probes, captures }), enumerable: false, writable: false, configurable: false });
  return freeze(evidence) as ValidatedTaskEvidence;
}

export function checkTaskEvidence(rootInput: string): ValidatedTaskEvidence {
  return checkTaskEvidenceWithSources(rootInput);
}

export function checkTaskEvidenceAgainstSources(rootInput: string, frame: Buffer, composition: Buffer): ValidatedTaskEvidence {
  return checkTaskEvidenceWithSources(rootInput, { frame, composition });
}
