import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { replaceProjectFileAtomically } from '../runtime/project-write.ts';
import type { ContentFitReceipt, ContentGrain } from './contract.ts';
import {
  contentGrainSha256,
  parseContentFitReceipt,
  parseContentGrain,
} from './contract.ts';
import { ContentGrainError } from './strict.ts';

export const CONTENT_GRAIN_PATH = '.omd/content-grain.json';
export const CONTENT_FIT_PATH = '.omd/content-fit.json';

export interface ContentGrainCheck {
  readonly schema: 'content-grain-check-v1';
  readonly status: ContentGrain['status'];
  readonly grainSha256: string;
  readonly traitIds: readonly string[];
  readonly fixtureIds: readonly string[];
}

const sha256 = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');

const parseJson = (bytes: Buffer, label: string): unknown => {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ContentGrainError('CONTENT_GRAIN_INVALID', `${label} is not valid JSON`);
  }
};

const readArtifact = (root: string, path: string, label: string): Buffer => {
  try {
    return readContainedRegularFile(root, path, label);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ContentGrainError('CONTENT_GRAIN_INVALID', detail);
  }
};

const writeArtifact = (
  root: string,
  relativePath: string,
  value: unknown,
  invocation: ProjectRunInvocation,
): void => {
  replaceProjectFileAtomically({
    projectRoot: root,
    relativePath,
    content: `${canonicalJson(value)}\n`,
    invocation,
  });
};

export const readContentGrain = (root: string): ContentGrain =>
  parseContentGrain(parseJson(readArtifact(root, CONTENT_GRAIN_PATH, 'Content Grain'), 'Content Grain'));

export const validateContentGrainSources = (
  root: string,
  grain: ContentGrain,
): void => {
  for (const source of grain.sources) {
    let bytes: Buffer;
    try {
      bytes = readContainedRegularFile(root, source.path, `Content Grain source ${source.id}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ContentGrainError('STALE_CONTENT_GRAIN_SOURCE', `${source.id}: ${detail}`);
    }
    if (sha256(bytes) !== source.sha256) {
      throw new ContentGrainError(
        'STALE_CONTENT_GRAIN_SOURCE',
        `${source.id}: source bytes changed`,
      );
    }
  }
};

export const checkContentGrain = (root: string): ContentGrainCheck => {
  const grain = readContentGrain(root);
  validateContentGrainSources(root, grain);
  return Object.freeze({
    schema: 'content-grain-check-v1',
    status: grain.status,
    grainSha256: contentGrainSha256(grain),
    traitIds: Object.freeze(
      grain.status === 'active' ? grain.traits.map(({ id }) => id).sort() : [],
    ),
    fixtureIds: Object.freeze(
      grain.status === 'active' ? grain.fixtures.map(({ id }) => id).sort() : [],
    ),
  });
};

export const publishContentGrain = (
  root: string,
  value: unknown,
  invocation: ProjectRunInvocation,
): ContentGrainCheck => {
  const grain = parseContentGrain(value);
  validateContentGrainSources(root, grain);
  writeArtifact(root, CONTENT_GRAIN_PATH, grain, invocation);
  return checkContentGrain(root);
};

export const readContentFitReceipt = (root: string): ContentFitReceipt =>
  parseContentFitReceipt(
    parseJson(readArtifact(root, CONTENT_FIT_PATH, 'Content Fit receipt'), 'Content Fit receipt'),
  );

export const publishContentFitReceipt = (
  root: string,
  value: unknown,
  invocation: ProjectRunInvocation,
): ContentFitReceipt => {
  const receipt = parseContentFitReceipt(value);
  writeArtifact(root, CONTENT_FIT_PATH, receipt, invocation);
  return receipt;
};
