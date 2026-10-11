import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { DesignDecision } from '../core/deliberation/contracts.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  BrowserObservationDecisionLinkError,
  browserObservationSha256,
  designDecisionSha256,
  type BrowserObservationCore,
} from '../core/runtime/browser-observation.ts';
import { validateObservationDecisionGraph } from '../core/runtime/observation-decision-graph.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omd-graph-snapshot-'));
  mkdirSync(join(root, '.omd', 'decision-graphs'), { recursive: true });
  const decision: DesignDecision = {
    id: 'record-layout', stage: 'composition', risk: 'medium', owner: 'omd-composer',
    question: 'Which layout preserves context?',
    alternatives: [{ id: 'inline', label: 'Inline' }, { id: 'separate', label: 'Separate' }],
    selected: 'inline', evidence: ['capture:record'], constraints: ['Preserve context'],
    rejected: [{ id: 'separate', reason: 'Context is separated.' }],
    affects: ['zone:record'], dependsOn: [], reversible: true, tradeoffs: [],
  };
  const before = Buffer.from(`${canonicalJson({ schema: 'decision-graph-v1', decisions: [decision] })}\n`);
  const currentGraph = Buffer.from(`${canonicalJson({
    schema: 'decision-graph-v1',
    decisions: [decision, { ...decision, id: 'save-emphasis', dependsOn: [decision.id] }],
  })}\n`);
  writeFileSync(join(root, '.omd', 'decision-graph.json'), currentGraph);
  const snapshot = join(root, '.omd', 'decision-graphs', `sha256-${sha(before)}.json`);
  writeFileSync(snapshot, before);
  const core: BrowserObservationCore = {
    schema: 'browser-observation-v1', testedUrl: 'http://localhost/', testedState: 'record',
    viewport: { width: 390, height: 844 },
    observableResult: {
      kind: 'screenshot', capture: { path: '.omd/capture.png', sha256: sha('capture') },
      result: { measurement: 'viewport-pixels', width: 390, height: 844 },
    },
    decisionRefs: [{ decisionId: decision.id, decisionSha256: designDecisionSha256(decision) }],
  };
  return {
    root, snapshot, before, currentGraph,
    evidence: { browserObservations: {
      schema: 'browser-observation-set-v1', decisionGraphSha256: sha(before),
      observations: [{ ...core, observationSha256: browserObservationSha256(core) }],
    } },
  };
}

function tree(root: string) {
  return readdirSync(root, { recursive: true, encoding: 'utf8' }).sort().map(path => {
    const full = join(root, path);
    const stat = lstatSync(full);
    return [path, stat.isSymbolicLink() ? readlinkSync(full) : stat.isFile() ? readFileSync(full).toString('hex') : null];
  });
}

for (const mode of ['missing', 'tampered', 'malformed', 'symlink', 'old-terminal'] as const) {
  test(`historical graph ${mode} refuses without filesystem mutation`, () => {
    const item = fixture();
    try {
      switch (mode) {
        case 'missing': rmSync(item.snapshot); break;
        case 'tampered': writeFileSync(item.snapshot, item.currentGraph); break;
        case 'malformed': {
          const malformed = Buffer.from('not-json');
          item.evidence.browserObservations.decisionGraphSha256 = sha(malformed);
          writeFileSync(join(item.root, '.omd', 'decision-graphs', `sha256-${sha(malformed)}.json`), malformed);
          break;
        }
        case 'symlink': {
          const target = join(item.root, '.omd', 'same-graph.json');
          writeFileSync(target, item.before);
          rmSync(item.snapshot);
          symlinkSync(target, item.snapshot);
          break;
        }
        case 'old-terminal': break;
      }
      const before = tree(item.root);
      assert.throws(() => validateObservationDecisionGraph({
        root: item.root, fs: nodeStableProjectFileSystem(), evidence: item.evidence,
        currentGraph: item.currentGraph, requireCurrentGraph: mode === 'old-terminal',
      }), (error: unknown) => error instanceof BrowserObservationDecisionLinkError
        && error.code === (mode === 'malformed' ? 'MALFORMED_BROWSER_OBSERVATION' : 'STALE_DECISION_GRAPH'));
      assert.deepEqual(tree(item.root), before);
    } finally { rmSync(item.root, { recursive: true, force: true }); }
  });
}

test('historical graph lookup rejects accessors before reading or invoking them', () => {
  const item = fixture();
  try {
    let calls = 0;
    Object.defineProperty(item.evidence.browserObservations, 'decisionGraphSha256', {
      enumerable: true, get() { calls += 1; return sha(item.before); },
    });
    const before = tree(item.root);
    assert.throws(() => validateObservationDecisionGraph({
      root: item.root, fs: nodeStableProjectFileSystem(), evidence: item.evidence,
      currentGraph: item.currentGraph, requireCurrentGraph: false,
    }), (error: unknown) => error instanceof BrowserObservationDecisionLinkError
      && error.code === 'MALFORMED_BROWSER_OBSERVATION');
    assert.equal(calls, 0);
    assert.deepEqual(tree(item.root), before);
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});
