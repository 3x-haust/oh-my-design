import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { loadMeasurement } from '../measure/files.ts';
import { readNativePiFile, readSignedNativePiRun, type NativePiRun } from '../runtime/native-pi-run-record.ts';
import { readPiRequest } from '../../extensions/omd-request-source.ts';
import { DeveloperEvaluationError } from './developer-evaluation-contract.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';

const fail = (reason: string): never => { throw new DeveloperEvaluationError(reason); };

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('invalid native maker evidence');
  return Object.fromEntries(Object.entries(value));
}
function makerEvidence(root: string, run: NativePiRun, experimental: boolean): string {
  const directory = join(root, '.omd/makers/executions');
  if (!existsSync(directory)) return fail('experiment output has no authenticated native maker');
  for (const name of readdirSync(directory)) {
    const match = /^([a-f0-9]{64})\.json$/.exec(name);
    if (!match?.[1]) continue;
    const bytes = readNativePiFile(root, join(directory, name));
    if (sha256(bytes) !== match[1]) return fail('native maker execution bytes changed');
    const value = object(JSON.parse(bytes.toString('utf8'))), receipt = object(value.receipt);
    if (receipt.schema !== 'native-pi-maker-execution-v1' || receipt.projectRoot !== root
      || (receipt.role !== 'omd-hand' && receipt.role !== 'omd-sketch')
      || typeof value.signature !== 'string'
      || !verifyNativeObservation(root, 'native-pi-maker-execution-v1', sha256(canonicalJson(receipt)), value.signature)) {
      return fail('native maker execution signature is invalid');
    }
    const bindings = object(receipt.fixedBindings);
    if (bindings.buildSha256 !== run.buildSha256 || bindings.briefSha256 !== run.briefSha256) continue;
    if (experimental) {
      if (bindings.calibration === undefined) continue;
      const calibration = object(bindings.calibration);
      const caseIds = calibration.caseIds;
      if (calibration.snapshotSha256 !== run.calibration?.digest || !Array.isArray(caseIds)
        || !run.calibration?.cases.some(entry => caseIds.includes(entry.caseId))) continue;
    }
    const handback = object(value.handback);
    if (typeof receipt.finalMessage !== 'string' || canonicalJson(JSON.parse(receipt.finalMessage)) !== canonicalJson(handback)
      || !Array.isArray(handback.files) || handback.files.length === 0) return fail('native maker handback is invalid');
    const current = handback.files.every((item: unknown) => {
      const file = object(item);
      return typeof file.path === 'string' && typeof file.content === 'string'
        && existsSync(join(root, file.path))
        && readNativePiFile(root, join(root, file.path)).toString('utf8') === file.content;
    });
    if (current) return match[1];
  }
  return fail('experiment output has no current maker with the delivered calibration');
}

export function parseDeveloperExperimentImages(value: unknown) {
  const object = (item: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)
      || Object.keys(item).sort().join(',') !== [...keys].sort().join(',')) return fail('invalid native result fields');
    return Object.fromEntries(Object.entries(item));
  };
  const digest = (item: unknown): string => {
    if (typeof item !== 'string' || !/^[a-f0-9]{64}$/.test(item)) return fail('invalid native result digest');
    return item;
  };
  const result = (item: unknown) => {
    const row = object(item, ['projectRoot', 'nativeRunId', 'nativeRunSha256', 'makerExecutionSha256', 'measurement', 'imageSha256']);
    const measurement = object(row.measurement, ['path', 'sha256']);
    const measurementSha256 = digest(measurement.sha256);
    if (typeof row.projectRoot !== 'string' || !row.projectRoot.startsWith('/')
      || measurement.path !== `.omd/visual-measurements/sha256-${measurementSha256}.json`) {
      return fail('invalid native result provenance');
    }
    return {
      projectRoot: row.projectRoot, nativeRunId: digest(row.nativeRunId),
      nativeRunSha256: digest(row.nativeRunSha256),
      makerExecutionSha256: digest(row.makerExecutionSha256),
      measurement: { path: measurement.path, sha256: measurementSha256 },
      imageSha256: digest(row.imageSha256),
    };
  };
  const pair = object(value, ['a', 'b']);
  return { a: result(pair.a), b: result(pair.b) };
}

export function verifyDeveloperExperimentImages(
  claimed: NativePiRun,
  images: Readonly<{ a: string; b: string }>,
  projects: Readonly<{ a: string; b: string }> = { a: claimed.projectRoot, b: claimed.projectRoot },
) {
  const runPath = '.omd/native-pi/run.json';
  const authenticated = readSignedNativePiRun(claimed.projectRoot, join(claimed.projectRoot, runPath));
  if (canonicalJson(authenticated) !== canonicalJson(claimed)) {
    return fail('experiment run differs from the signed native host record');
  }
  const capture = (project: string, imageSha256: string) => {
    const root = realpathSync(project);
    const run = readSignedNativePiRun(root, join(root, runPath));
    if (run.briefSha256 !== authenticated.briefSha256
      || readPiRequest(root)?.requestSha256 !== run.briefSha256
      || run.buildSha256 !== authenticated.buildSha256
      || run.runtimeSha256 !== authenticated.runtimeSha256
      || run.host.provider !== authenticated.host.provider
      || run.host.model !== authenticated.host.model
      || run.host.thinkingLevel !== authenticated.host.thinkingLevel) {
      return fail('compared experiment outputs need matching authenticated request and generation settings');
    }
    const makerExecutionSha256 = makerEvidence(root, run, run.runId === authenticated.runId);
    for (const name of readdirSync(join(root, '.omd/visual-measurements'))) {
      const match = /^sha256-([a-f0-9]{64})\.json$/.exec(name);
      if (!match?.[1]) continue;
      const path = `.omd/visual-measurements/${name}`;
      const bytes = readNativePiFile(root, join(root, path));
      const candidate: unknown = JSON.parse(bytes.toString('utf8'));
      if (typeof candidate !== 'object' || candidate === null) continue;
      const captures: unknown = Reflect.get(candidate, 'captures');
      if (!Array.isArray(captures) || !captures.some((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const image: unknown = Reflect.get(item, 'capture');
        return typeof image === 'object' && image !== null && Reflect.get(image, 'sha256') === imageSha256;
      })) continue;
      const receipt = { path, sha256: match[1] };
      const measured = loadMeasurement(root, receipt);
      if (measured.binding.activationBuildSha256 !== run.buildSha256) {
        return fail('experiment capture belongs to another native build');
      }
      return {
        projectRoot: root, nativeRunId: run.runId,
        nativeRunSha256: sha256(readNativePiFile(root, join(root, runPath))),
        makerExecutionSha256,
        measurement: receipt, imageSha256,
      };
    }
    return fail('experiment image has no authentic native measurement evidence');
  };
  const a = capture(projects.a, images.a), b = capture(projects.b, images.b);
  if (a.nativeRunId !== authenticated.runId && b.nativeRunId !== authenticated.runId) {
    return fail('neither compared image belongs to the experimental native run');
  }
  return { a, b };
}
