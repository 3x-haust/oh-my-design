import { resolve } from 'node:path';
import {
  BrowserObservationDecisionLinkError,
  validateBrowserObservationArtifacts,
  validateBrowserObservationDecisionLinks,
} from '../runtime/browser-observation.ts';
import { readStableProjectFile, StableProjectFileReadError, type StableProjectFileSystem } from '../runtime/stable-project-file.ts';

export interface FinalBrowserObservationFs extends StableProjectFileSystem {}
type StableReadContext = Readonly<{
  root: string;
  fs: FinalBrowserObservationFs;
  code: 'STALE_DECISION_GRAPH' | 'INVALID_OBSERVATION_ARTIFACT';
  label: string;
}>;

function fail(code: 'STALE_DECISION_GRAPH' | 'INVALID_OBSERVATION_ARTIFACT', message: string): never {
  throw new BrowserObservationDecisionLinkError(code, message);
}
function readBrowserProjectFile(context: StableReadContext, path: string): Buffer {
  try { return readStableProjectFile({ root: context.root, fs: context.fs, path, label: context.label }); } catch (error) {
    if (error instanceof StableProjectFileReadError) fail(context.code, error.message);
    throw error;
  }
}

/** Revalidates every final observation against stable decision-graph and screenshot bytes. */
export function validateFinalBrowserObservations(rootInput: string, fs: FinalBrowserObservationFs, evidence: readonly unknown[]): void {
  const root = resolve(rootInput);
  const decisionGraph = readBrowserProjectFile({ root, fs, code: 'STALE_DECISION_GRAPH', label: 'current design decision graph' }, fsPath(root, '.omd/decision-graph.json'));
  evidence.forEach((value, index) => {
    const links = validateBrowserObservationDecisionLinks(value, decisionGraph, true);
    if (links === undefined) fail('INVALID_OBSERVATION_ARTIFACT', `observation ${index} has no browser links`);
    validateBrowserObservationArtifacts(links, (path) => readBrowserProjectFile({ root, fs, code: 'INVALID_OBSERVATION_ARTIFACT', label: `observation ${index} browser capture` }, fsPath(root, path)), true);
  });
}
function fsPath(root: string, projectPath: string): string { return resolve(root, ...projectPath.split('/')); }
