import { createHash, randomBytes } from 'node:crypto';
import { closeSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { crc32 } from 'node:zlib';
import { decodePng } from '../motion/energy.ts';
import { validateSourceSeal } from '../source-seal/index.ts';
import { checkTaskEvidence } from './task.ts';

export const FINAL_EVIDENCE_SCHEMA_VERSION = 1;

export type FinalEvidenceArtifactKind = 'check' | 'test' | 'probe' | 'screenshot' | 'render' | 'filmstrip' | 'task-evidence';

interface FinalEvidenceArtifactBase {
  path: string;
  sha256: string;
}

export type FinalEvidenceArtifact =
  | ({ kind: 'check' | 'test' | 'filmstrip' | 'task-evidence' } & FinalEvidenceArtifactBase)
  | ({ kind: 'probe'; role: 'primary' | 'recovery' } & FinalEvidenceArtifactBase)
  | ({ kind: 'screenshot' | 'render'; viewport: 'desktop' | 'mobile' } & FinalEvidenceArtifactBase);

export interface FinalEvidenceInteraction {
  scope: 'stateful' | 'navigation-only' | 'static';
  motion: boolean;
  surface: 'marketing' | 'product' | 'editorial' | 'mixed';
}

export interface FinalEvidenceBuild {
  target: string;
  fingerprint: string;
  servedTarget: string;
}

export interface FinalEvidenceTools {
  versions: Record<string, string>;
  commands: string[];
}

export interface FinalEvidenceManifest {
  schemaVersion: 1;
  runId: string;
  sourceSeal: { path: '.omd/source-seal.json'; sha256: string };
  build: FinalEvidenceBuild;
  tools: FinalEvidenceTools;
  interaction: FinalEvidenceInteraction;
  artifacts: FinalEvidenceArtifact[];
}

export type FinalEvidence = FinalEvidenceManifest;

const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_KINDS = new Set<FinalEvidenceArtifactKind>(['check', 'test', 'probe', 'screenshot', 'render', 'filmstrip', 'task-evidence']);
const INTERACTION_SCOPES = new Set<FinalEvidenceInteraction['scope']>(['stateful', 'navigation-only', 'static']);
const INTERACTION_SURFACES = new Set<FinalEvidenceInteraction['surface']>(['marketing', 'product', 'editorial', 'mixed']);
const ARTIFACT_CACHE_PREFIX = '.omd/.cache/';
const compare = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const digest = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON rejects non-finite numbers');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new Error('canonical JSON rejects unsupported values');
  return `{${Object.keys(value).sort(compare).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compare);
  const expected = [...keys].sort(compare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unknown or missing keys`);
  }
}

function safePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
    throw new Error(`${label} must be a safe project-relative path`);
  }
  if (value.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a safe project-relative path`);
  }
  return value;
}

function safeString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) throw new Error(`${label} must be a non-empty string without leading or trailing whitespace`);
  return value;
}

function safeRunId(value: unknown): string {
  const runId = safeString(value, 'runId');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)*$/.test(runId) || runId.length > 128) throw new Error('runId must be a safe stable filename identifier');
  return runId;
}

function safeSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function projectRoot(rootInput: string): string {
  const root = resolve(rootInput);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`project root must be a non-symlink directory: ${root}`);
  return root;
}

/** Resolves a path only after rejecting symlinks and special files in every component. */
function regularProjectFile(root: string, path: string): string {
  const safe = safePath(path, 'path');
  const absolute = resolve(root, ...safe.split('/'));
  const rel = relative(root, absolute);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`path escapes project: ${path}`);
  let current = root;
  const segments = safe.split('/');
  for (const [index, segment] of segments.entries()) {
    current = resolve(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${path}`);
    if (index === segments.length - 1) {
      if (!stat.isFile()) throw new Error(`not a regular file: ${path}`);
    } else if (!stat.isDirectory()) {
      throw new Error(`not a directory: ${path}`);
    }
  }
  return absolute;
}

function buildFingerprintAt(root: string, path: string): string {
  const safe = safePath(path, 'build target');
  const absolute = resolve(root, ...safe.split('/'));
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${safe}`);
  if (stat.isFile()) return digest(readFileSync(regularProjectFile(root, safe)));
  if (!stat.isDirectory()) throw new Error(`build target is not a regular file or directory: ${safe}`);

  const entries: string[] = [];
  const walk = (relativePath: string): void => {
    const directory = resolve(root, ...relativePath.split('/'));
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      const child = `${relativePath}/${entry.name}`;
      const childStat = lstatSync(resolve(directory, entry.name));
      if (childStat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${child}`);
      if (childStat.isDirectory()) walk(child);
      else if (childStat.isFile()) entries.push(child);
      else throw new Error(`special file is forbidden: ${child}`);
    }
  };
  walk(safe);
  const canonical = entries.sort(compare).map(path => `${path}\0${digest(readFileSync(regularProjectFile(root, path)))}`).join('\n');
  return digest(canonical);
}

export function computeBuildFingerprint(rootInput: string, target: string): string {
  return buildFingerprintAt(projectRoot(rootInput), target);
}

function parseManifest(value: unknown): FinalEvidenceManifest {
  if (!isRecord(value)) throw new Error('final evidence manifest must be an object');
  exactKeys(value, ['schemaVersion', 'runId', 'sourceSeal', 'build', 'tools', 'interaction', 'artifacts'], 'final evidence manifest');
  if (value.schemaVersion !== FINAL_EVIDENCE_SCHEMA_VERSION) throw new Error('final evidence manifest schemaVersion must be 1');
  const sourceSeal = value.sourceSeal;
  const build = value.build;
  const tools = value.tools;
  const interaction = value.interaction;
  if (!isRecord(sourceSeal) || !isRecord(build) || !isRecord(tools) || !isRecord(interaction) || !Array.isArray(value.artifacts)) throw new Error('final evidence manifest has invalid nested values');
  exactKeys(sourceSeal, ['path', 'sha256'], 'sourceSeal');
  if (sourceSeal.path !== '.omd/source-seal.json') throw new Error('sourceSeal.path must be .omd/source-seal.json');
  exactKeys(build, ['target', 'fingerprint', 'servedTarget'], 'build');
  exactKeys(tools, ['versions', 'commands'], 'tools');
  exactKeys(interaction, ['scope', 'motion', 'surface'], 'interaction');
  if (
    typeof interaction.scope !== 'string'
    || !INTERACTION_SCOPES.has(interaction.scope as FinalEvidenceInteraction['scope'])
    || typeof interaction.motion !== 'boolean'
    || typeof interaction.surface !== 'string'
    || !INTERACTION_SURFACES.has(interaction.surface as FinalEvidenceInteraction['surface'])
  ) {
    throw new Error('interaction must contain a valid scope, boolean motion, and valid surface');
  }
  if ((interaction.surface === 'product' || interaction.surface === 'mixed') && interaction.scope === 'static') {
    throw new Error('product and mixed interactions must not be static');
  }
  if (!isRecord(tools.versions) || !Array.isArray(tools.commands)) throw new Error('tools must contain versions and commands');
  const versions: Record<string, string> = {};
  for (const [name, version] of Object.entries(tools.versions)) versions[safeString(name, 'tool version name')] = safeString(version, `tool version ${name}`);
  if (Object.keys(versions).length === 0 || tools.commands.length === 0) throw new Error('tools versions and commands must be non-empty');
  const commands = tools.commands.map((command, index) => safeString(command, `tools.commands[${index}]`));
  if (new Set(commands).size !== commands.length) throw new Error('tools.commands contains a duplicate command');
  if (value.artifacts.length === 0) throw new Error('artifacts must be non-empty');
  const artifacts = value.artifacts.map((item, index): FinalEvidenceArtifact => {
    if (!isRecord(item)) throw new Error(`artifacts[${index}] must be an object`);
    if (typeof item.kind !== 'string' || !ARTIFACT_KINDS.has(item.kind as FinalEvidenceArtifactKind)) throw new Error(`artifacts[${index}].kind is invalid`);
    const path = safePath(item.path, `artifacts[${index}].path`);
    if (item.kind === 'task-evidence') {
      if (path !== '.omd/task-evidence.json') throw new Error('task-evidence artifact path must be .omd/task-evidence.json');
    } else if (!path.startsWith(ARTIFACT_CACHE_PREFIX)) throw new Error(`artifacts[${index}].path must be under ${ARTIFACT_CACHE_PREFIX}`);
    const sha256 = safeSha256(item.sha256, `artifacts[${index}].sha256`);
    switch (item.kind) {
      case 'check':
      case 'test':
      case 'filmstrip':
      case 'task-evidence':
        exactKeys(item, ['kind', 'path', 'sha256'], `artifacts[${index}]`);
        return { kind: item.kind, path, sha256 };
      case 'probe':
        exactKeys(item, ['kind', 'path', 'sha256', 'role'], `artifacts[${index}]`);
        if (item.role !== 'primary' && item.role !== 'recovery') throw new Error(`artifacts[${index}].role is invalid`);
        return { kind: 'probe', path, sha256, role: item.role };
      case 'screenshot':
      case 'render':
        exactKeys(item, ['kind', 'path', 'sha256', 'viewport'], `artifacts[${index}]`);
        if (item.viewport !== 'desktop' && item.viewport !== 'mobile') throw new Error(`artifacts[${index}].viewport is invalid`);
        return { kind: item.kind, path, sha256, viewport: item.viewport };
      default:
        throw new Error(`artifacts[${index}].kind is invalid`);
    }
  });
  const paths = new Set<string>();
  for (const artifact of artifacts) {
    if (paths.has(artifact.path)) throw new Error(`duplicate artifact path: ${artifact.path}`);
    paths.add(artifact.path);
  }
  for (const kind of ['check', 'test'] as const) {
    if (!artifacts.some(artifact => artifact.kind === kind)) throw new Error(`artifacts must include a ${kind} record`);
  }
  const probes = artifacts.filter((artifact): artifact is Extract<FinalEvidenceArtifact, { kind: 'probe' }> => artifact.kind === 'probe');
  const primaryProbes = probes.filter(artifact => artifact.role === 'primary').length;
  const recoveryProbes = probes.filter(artifact => artifact.role === 'recovery').length;
  if (interaction.scope === 'stateful' && (primaryProbes !== 1 || recoveryProbes !== 1)) throw new Error('stateful interaction requires exactly one primary and one recovery probe');
  if (interaction.scope === 'navigation-only' && (primaryProbes !== 1 || recoveryProbes !== 0)) throw new Error('navigation-only interaction requires exactly one primary probe and no recovery probe');
  if (interaction.scope === 'static' && probes.length !== 0) throw new Error('static interaction must not include probes');
  const viewports = new Set(artifacts.filter((artifact): artifact is Extract<FinalEvidenceArtifact, { viewport: 'desktop' | 'mobile' }> => artifact.kind === 'screenshot' || artifact.kind === 'render').map(artifact => artifact.viewport));
  if (!viewports.has('desktop') || !viewports.has('mobile')) throw new Error('artifacts must include desktop and mobile screenshot or render records');
  const filmstrips = artifacts.filter(artifact => artifact.kind === 'filmstrip').length;
  if (interaction.motion ? filmstrips === 0 : filmstrips !== 0) throw new Error(interaction.motion ? 'motion interaction requires a filmstrip' : 'non-motion interaction must not include filmstrips');
  return {
    schemaVersion: 1,
    runId: safeRunId(value.runId),
    sourceSeal: { path: '.omd/source-seal.json', sha256: safeSha256(sourceSeal.sha256, 'sourceSeal.sha256') },
    build: { target: safePath(build.target, 'build.target'), fingerprint: safeSha256(build.fingerprint, 'build.fingerprint'), servedTarget: safeString(build.servedTarget, 'build.servedTarget') },
    tools: { versions, commands },
    interaction: { scope: interaction.scope as FinalEvidenceInteraction['scope'], motion: interaction.motion, surface: interaction.surface as FinalEvidenceInteraction['surface'] },
    artifacts,
  };
}

function frameSurface(root: string): FinalEvidenceInteraction['surface'] {
  const path = regularProjectFile(root, '.omd/frame.md');
  const source = readFileSync(path, 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source)?.[1];
  if (frontmatter === undefined) throw new Error('frame must have YAML frontmatter');
  let value: unknown;
  try {
    value = parse(frontmatter);
  } catch {
    throw new Error('frame frontmatter is malformed');
  }
  if (!isRecord(value) || typeof value.uxSurface !== 'string') {
    throw new Error('frame uxSurface must be a primitive surface value');
  }
  const normalized = value.uxSurface.trim().toLowerCase();
  if (!INTERACTION_SURFACES.has(normalized as FinalEvidenceInteraction['surface'])) {
    throw new Error('frame uxSurface is unknown');
  }
  return normalized as FinalEvidenceInteraction['surface'];
}

function decodedPng(path: string, label: string): ReturnType<typeof decodePng> {
  try {
    const bytes = readFileSync(path);
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('bad signature');
    let offset = 8;
    let sawIhdr = false;
    let sawIdat = false;
    let sawIend = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw new Error('truncated chunk');
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) throw new Error('truncated chunk data');
      const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
      if ((crc32(bytes.subarray(offset + 4, offset + 8 + length)) >>> 0) !== bytes.readUInt32BE(offset + 8 + length)) throw new Error('invalid chunk CRC');
      if (!sawIhdr && (type !== 'IHDR' || length !== 13)) throw new Error('IHDR must be first');
      if (type === 'IHDR') {
        if (sawIhdr) throw new Error('duplicate IHDR');
        sawIhdr = true;
      } else if (type === 'IDAT') {
        if (!sawIhdr || sawIend) throw new Error('invalid IDAT placement');
        sawIdat = true;
      } else if (type === 'IEND') {
        if (!sawIhdr || !sawIdat || length !== 0 || sawIend || end !== bytes.length) throw new Error('invalid IEND');
        sawIend = true;
      }
      offset = end;
    }
    if (!sawIhdr || !sawIdat || !sawIend) throw new Error('missing required PNG chunks');
    return decodePng(bytes);
  } catch {
    throw new Error(`${label} must be a structurally valid PNG`);
  }
}

function verifyMedia(root: string, manifest: FinalEvidenceManifest): void {
  for (const artifact of manifest.artifacts) {
    const path = regularProjectFile(root, artifact.path);
    if (artifact.kind === 'screenshot' || artifact.kind === 'render') {
      const expected = artifact.viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 };
      const image = decodedPng(path, `${artifact.kind} ${artifact.path}`);
      if (image.width !== expected.width || image.height !== expected.height) {
        throw new Error(`${artifact.kind} ${artifact.path} must be ${expected.width}x${expected.height} for ${artifact.viewport}`);
      }
    } else if (artifact.kind === 'filmstrip') {
      const image = decodedPng(path, `filmstrip ${artifact.path}`);
      const first = image.pixels[0];
      if (image.pixels.every(pixel => pixel === first)) throw new Error(`filmstrip ${artifact.path} must be non-uniform`);
    }
  }
}

function verifyTaskEvidenceApplicability(manifest: FinalEvidenceManifest, frame: FinalEvidenceInteraction['surface']): void {
  const taskEvidenceArtifacts = manifest.artifacts.filter((artifact): artifact is Extract<FinalEvidenceArtifact, { kind: 'task-evidence' }> => artifact.kind === 'task-evidence');
  if ((frame === 'product' || frame === 'mixed') && taskEvidenceArtifacts.length !== 1) {
    throw new Error('product and mixed frame surfaces require exactly one task-evidence artifact');
  }
  if ((frame === 'marketing' || frame === 'editorial') && taskEvidenceArtifacts.length !== 0) {
    throw new Error('marketing and editorial frame surfaces must not include task-evidence artifacts');
  }
}

function verifyBindings(root: string, manifest: FinalEvidenceManifest): void {
  const sourceSeal = regularProjectFile(root, manifest.sourceSeal.path);
  if (digest(readFileSync(sourceSeal)) !== manifest.sourceSeal.sha256) throw new Error(`source seal digest mismatch: ${manifest.sourceSeal.path}`);
  const findings = validateSourceSeal(root);
  if (findings.length > 0) throw new Error(`source seal is stale: ${findings.map(finding => finding.path).join(', ')}`);
  const frame = frameSurface(root);
  if (frame !== manifest.interaction.surface) throw new Error('frame uxSurface does not match interaction surface');
  verifyTaskEvidenceApplicability(manifest, frame);
  const fingerprint = buildFingerprintAt(root, manifest.build.target);
  if (fingerprint !== manifest.build.fingerprint) throw new Error(`build fingerprint mismatch: ${manifest.build.target}`);
  const taskEvidence = manifest.artifacts.find((artifact): artifact is Extract<FinalEvidenceArtifact, { kind: 'task-evidence' }> => artifact.kind === 'task-evidence');
  if (taskEvidence && checkTaskEvidence(root).surface !== frame) throw new Error('task evidence surface does not match frame uxSurface');
  for (const artifact of manifest.artifacts) {
    const path = regularProjectFile(root, artifact.path);
    if (digest(readFileSync(path)) !== artifact.sha256) throw new Error(`artifact digest mismatch: ${artifact.kind} ${artifact.path}`);
  }
  verifyMedia(root, manifest);
}

function readManifestFile(path: string): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`manifest must be a regular non-symlink file: ${path}`);
  try { return JSON.parse(readFileSync(path, 'utf8')) as unknown; } catch { throw new Error(`manifest is not valid JSON: ${path}`); }
}

/** Validates a caller manifest and atomically publishes an immutable bound final evidence record. */
export function finalizeFinalEvidence(rootInput: string, manifestPath: string): string {
  const root = projectRoot(rootInput);
  const manifest = parseManifest(readManifestFile(resolve(manifestPath)));
  verifyBindings(root, manifest);
  const omd = resolve(root, '.omd');
  const runs = resolve(omd, 'final-evidence-runs');
  const output = resolve(omd, 'final-evidence.json');
  const lock = resolve(omd, '.final-evidence.lock');
  const record = resolve(runs, `${manifest.runId}.json`);
  const bytes = `${canonicalJson(manifest)}\n`;

  mkdirSync(omd, { recursive: true });
  const omdStat = lstatSync(omd);
  if (!omdStat.isDirectory() || omdStat.isSymbolicLink()) throw new Error(`final evidence directory must be a non-symlink directory: ${omd}`);
  mkdirSync(runs, { recursive: true });
  const runsStat = lstatSync(runs);
  if (!runsStat.isDirectory() || runsStat.isSymbolicLink()) throw new Error(`final evidence directory must be a non-symlink directory: ${runs}`);

  let lockFd: number | undefined;
  try {
    try {
      lockFd = openSync(lock, 'wx', 0o600);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('final evidence publication is already in progress');
      throw error;
    }

    try {
      writeFileSync(record, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`final evidence run already exists: ${manifest.runId}`);
      throw error;
    }

    const current = (() => {
      try { return lstatSync(output); } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    })();
    if (current && (!current.isFile() || current.isSymbolicLink())) throw new Error(`final evidence current record must be a regular non-symlink file: ${output}`);

    const temporary = resolve(omd, `.final-evidence.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
    try {
      writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
      if (current) renameSync(temporary, output);
      else linkSync(temporary, output);
    } catch (error: unknown) {
      if (!current && (error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('final evidence current record appeared during publication');
      throw error;
    } finally {
      try { unlinkSync(temporary); } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return output;
  } finally {
    if (lockFd !== undefined) {
      try { closeSync(lockFd); } finally {
        try { unlinkSync(lock); } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
}

/** Re-reads the published record and verifies all bound source, build, and artifact bytes. */
export function checkFinalEvidence(rootInput: string): FinalEvidence {
  const root = projectRoot(rootInput);
  const path = regularProjectFile(root, '.omd/final-evidence.json');
  const bytes = readFileSync(path);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error(`manifest is not valid JSON: ${path}`); }
  const manifest = parseManifest(value);
  const record = regularProjectFile(root, `.omd/final-evidence-runs/${manifest.runId}.json`);
  if (!bytes.equals(readFileSync(record))) throw new Error(`final evidence current record does not match immutable run record: ${manifest.runId}`);
  verifyBindings(root, manifest);
  return manifest;
}
