import { createHash, randomBytes } from 'node:crypto';
import { closeSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { validateTaskCoverageMatrix } from '../frame/check-ux.ts';
import { decodePng } from '../motion/energy.ts';
import { validateProbePlan, type ProbePlan, type ProbeResult } from '../probe/index.ts';

export const TASK_EVIDENCE_SCHEMA_VERSION = 1;
export interface TaskEvidence { schemaVersion: 1; surface: 'product' | 'mixed'; frame: Bound; composition: Bound; tasks: Task[]; }
interface Bound { path: string; sha256: string }
type ProbeRole = 'primary' | 'recovery' | 'invalid-submit';
interface Probe { planPath: string; planSha256: string; resultPath: string; resultSha256: string; role: ProbeRole; viewport: Viewport }
type Viewport = 'desktop' | 'mobile';
interface Render { path: string; sha256: string; viewport: Viewport }
interface Transient { path: string; sha256: string; captureMode: 'settled' | 'reduced-motion'; probeRole: 'primary' | 'recovery'; stateSelector: string; stepIndex: number; viewport: Viewport }
interface Task { id: string; context: 'production'; production: { route: string; locator: string; workObject: string }; probes: Probe[]; renders: Render[]; invalidSubmit?: Probe; transient?: Transient[] }
interface FrameRow { recovery: string; viewports: string; requirements: string }

const CACHE = '.omd/.cache/';
const SHA256 = /^[a-f0-9]{64}$/;
const RESERVED_ROUTE_SEGMENT = /(?:^|\/)(?:demo|storybook|showcase|fixture|demo[-_ ]fixture)(?:\/|$)/i;
const RESERVED_LABEL_TOKEN = /(?:^|[^a-z0-9])(?:showcase|storybook|demo[-_ ]fixture|fixture)(?=$|[^a-z0-9])/i;
const VIEWPORTS: Record<Viewport, { width: number; height: number }> = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
const compare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
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
function parseRender(value: unknown, label: string): Render {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exact(value, ['path', 'sha256', 'viewport'], label);
  if (value.viewport !== 'desktop' && value.viewport !== 'mobile') throw new Error(`${label}.viewport is invalid`);
  return { path: cachePath(value.path, `${label}.path`), sha256: hash(value.sha256, `${label}.sha256`), viewport: value.viewport };
}
function parseTransient(value: unknown, label: string): Transient {
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
  return { id, context: 'production', production, probes, renders, ...(invalidSubmit ? { invalidSubmit } : {}), ...(transient ? { transient } : {}) };
}
function parseManifest(value: unknown): TaskEvidence {
  if (!isRecord(value)) throw new Error('task evidence manifest must be an object');
  exact(value, ['schemaVersion', 'surface', 'frame', 'composition', 'tasks'], 'task evidence manifest');
  if (value.schemaVersion !== 1 || (value.surface !== 'product' && value.surface !== 'mixed') || !Array.isArray(value.tasks)) throw new Error('task evidence manifest is invalid');
  const tasks = value.tasks.map(parseTask);
  if (!tasks.length || new Set(tasks.map(task => task.id)).size !== tasks.length || new Set(tasks.map(task => task.production.locator)).size !== tasks.length) throw new Error('task ids and production locators must be globally unique');
  return { schemaVersion: 1, surface: value.surface, frame: bound(value.frame, 'frame', '.omd/frame.md'), composition: bound(value.composition, 'composition', '.omd/composition.md'), tasks };
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
  const planBytes = readFileSync(file(root, evidence.planPath)); const resultBytes = readFileSync(file(root, evidence.resultPath));
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
  const result = verifyProbe(root, evidence, task); const plan = validateProbePlan(JSON.parse(readFileSync(file(root, evidence.planPath), 'utf8')));
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
    const bytes = readFileSync(file(root, artifact.path)); if (digest(bytes) !== artifact.sha256) throw new Error(`transient digest mismatch: ${task.id}`);
    const result = results.get(`${artifact.probeRole}:${artifact.viewport}`); if (!result) throw new Error(`transient must bind an existing ${artifact.probeRole} probe: ${task.id}`);
    const viewport = VIEWPORTS[artifact.viewport];
    const probe = task.probes.find(item => item.role === artifact.probeRole && item.viewport === artifact.viewport)!;
    const plan = validateProbePlan(JSON.parse(readFileSync(file(root, probe.planPath), 'utf8')));
    const step = plan.steps[artifact.stepIndex]; const observed = result.steps[artifact.stepIndex];
    if (!step || !observed || (step.action !== 'click' && step.action !== 'press') || step.selector !== task.production.locator) throw new Error(`transient state must be a successful production activation observable: ${task.id}`);
    const matchesState = (step.expect ?? []).some((expectation, index) => expectation.type !== 'url' && expectation.selector === artifact.stateSelector && expectationMatches(expectation, observed.expectations[index]!));
    if (!matchesState) throw new Error(`transient state must be a successful production activation observable: ${task.id}`);
    if (!hasMeaningfulVisibleVariation(verifyPng(bytes, viewport, `transient evidence for ${task.id}`))) throw new Error(`transient evidence must contain meaningful coherent visible PNG pixels: ${task.id}`);
  }
}
function verify(root: string, evidence: TaskEvidence): void {
  const frame = readFileSync(file(root, evidence.frame.path));
  const composition = readFileSync(file(root, evidence.composition.path));
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
    for (const probe of [...primary, ...recovery]) results.set(`${probe.role}:${probe.viewport}`, verifyProbe(root, probe, task));
    if (task.invalidSubmit) verifyInvalidSubmit(root, task.invalidSubmit, task);

    for (const render of task.renders) {
      const bytes = readFileSync(file(root, render.path));
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
}
function readManifest(input: string): unknown {
  regularFile(input, 'manifest');
  return JSON.parse(readFileSync(input, 'utf8'));
}
function lstatMissing(pathname: string): boolean {
  try {
    lstatSync(pathname);
    return false;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}
function regularFile(pathname: string, label: string): void {
  const stat = lstatSync(pathname);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
}
function ensureDirectory(root: string, projectPath: string): string {
  let current = root;
  for (const part of projectPath.split('/')) {
    current = resolve(current, part);
    if (lstatMissing(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`publication directory must be a non-symlink directory: ${projectPath}`);
    }
  }
  return current;
}
function cleanupTemporary(pathname: string): void {
  if (lstatMissing(pathname)) return;
  regularFile(pathname, 'task evidence temporary record');
  unlinkSync(pathname);
}
function acquirePublicationLock(lock: string): number {
  if (!lstatMissing(lock)) throw new Error('task evidence publication lock already exists');
  try {
    const fd = openSync(lock, 'wx', 0o600);
    regularFile(lock, 'task evidence publication lock');
    return fd;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('task evidence publication lock already exists');
    throw error;
  }
}
function publishImmutable(pathname: string, bytes: Buffer): void {
  if (lstatMissing(pathname)) {
    try {
      writeFileSync(pathname, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  regularFile(pathname, 'task evidence immutable record');
  if (!readFileSync(pathname).equals(bytes)) throw new Error('task evidence immutable record bytes differ');
}
function publishCurrent(omd: string, output: string, bytes: Buffer): void {
  const temporary = resolve(omd, `.task-evidence.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
  if (!lstatMissing(temporary)) throw new Error('task evidence temporary record already exists');
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    regularFile(temporary, 'task evidence temporary record');

    if (!lstatMissing(output)) regularFile(output, 'task evidence current record');
    if (lstatMissing(output)) {
      try {
        linkSync(temporary, output);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new Error('task evidence current record appeared during publication');
        }
        throw error;
      }
    } else {
      renameSync(temporary, output);
    }

    regularFile(output, 'task evidence current record');
    if (!readFileSync(output).equals(bytes)) throw new Error('task evidence current record bytes differ');
  } finally {
    cleanupTemporary(temporary);
  }
}
function releasePublicationLock(lock: string, fd: number): void {
  closeSync(fd);
  regularFile(lock, 'task evidence publication lock');
  unlinkSync(lock);
}
export function publishTaskEvidence(rootInput: string, input: string): string {
  const root = rootOf(rootInput);
  const relativeInput = relative(root, resolve(input)).split(sep).join('/');
  if (!relativeInput.startsWith(CACHE)) throw new Error(`task evidence manifest must be cache-only: ${CACHE}`);

  const evidence = parseManifest(readManifest(file(root, relativeInput)));
  verify(root, evidence);
  const bytes = Buffer.from(`${canonical(evidence)}\n`);
  const omd = ensureDirectory(root, '.omd');
  const runs = ensureDirectory(root, '.omd/task-evidence-runs');
  const immutable = resolve(runs, `${digest(bytes)}.json`);
  const output = resolve(omd, 'task-evidence.json');
  const lock = resolve(omd, '.task-evidence.lock');
  const lockFd = acquirePublicationLock(lock);
  try {
    publishImmutable(immutable, bytes);
    publishCurrent(omd, output, bytes);
    return output;
  } finally {
    releasePublicationLock(lock, lockFd);
  }
}
export function checkTaskEvidence(rootInput: string): TaskEvidence {
  const root = rootOf(rootInput);
  const current = file(root, '.omd/task-evidence.json');
  const bytes = readFileSync(current);
  const evidence = parseManifest(JSON.parse(bytes.toString('utf8')));

  let immutable: string;
  try {
    immutable = file(root, `.omd/task-evidence-runs/${digest(bytes)}.json`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('task evidence immutable publication is missing');
    }
    throw error;
  }
  if (!bytes.equals(readFileSync(immutable))) {
    throw new Error('task evidence current record does not match immutable publication');
  }
  verify(root, evidence);
  return evidence;
}
