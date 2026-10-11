import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  BrowserObservationDecisionLinkError,
  validateBrowserObservationDecisionLinks,
  type BrowserObservationSet,
} from './browser-observation.ts';
import {
  readStableProjectFile,
  StableProjectFileReadError,
  type StableProjectFileSystem,
} from './stable-project-file.ts';

/** Historical authority comes from the trusted publisher's exact graph snapshot. */
export function validateObservationDecisionGraph(input: Readonly<{
  root: string;
  fs: StableProjectFileSystem;
  evidence: unknown;
  currentGraph: Buffer;
  requireCurrentGraph: boolean;
}>): Readonly<{ links: BrowserObservationSet; graphBytes: Buffer }> {
  let graphBytes = input.currentGraph;
  const currentSha256 = createHash('sha256').update(input.currentGraph).digest('hex');
  const links = validateBrowserObservationDecisionLinks(input.evidence, (sha256) => {
    if (input.requireCurrentGraph || sha256 === currentSha256) return input.currentGraph;
    try {
      graphBytes = readStableProjectFile({
        root: input.root,
        path: resolve(input.root, `.omd/decision-graphs/sha256-${sha256}.json`),
        label: 'historical design decision graph',
        fs: input.fs,
      });
      return graphBytes;
    } catch (error) {
      if (error instanceof StableProjectFileReadError) {
        throw new BrowserObservationDecisionLinkError('STALE_DECISION_GRAPH', error.message);
      }
      throw error;
    }
  }, true);
  if (links === undefined) {
    throw new BrowserObservationDecisionLinkError('MISSING_DECISION_LINK', 'observation has no browser decision links');
  }
  return { links, graphBytes };
}
