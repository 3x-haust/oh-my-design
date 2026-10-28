import assert from 'node:assert/strict';
import test from 'node:test';
import { finalReviewerLanePaths } from '../core/completion/reviewer-lanes.ts';

const lane = (name: string) => ({ path: `.omd/final-review/lanes/${name}.json`, sha256: 'a'.repeat(64) });

test('a measured terminal is checked through the lanes it selected, not the three legacy lanes', () => {
  assert.deepEqual(finalReviewerLanePaths({ measuredTerminal: { lanes: { blindLane: lane('blind') } } }),
    ['.omd/final-review/lanes/blind.json']);
});

test('a legacy graph still needs all three lane receipts, and a measured terminal must select one', () => {
  assert.deepEqual(finalReviewerLanePaths({ blindLane: lane('b'), fidelityLane: lane('f'), protocolLane: lane('p') }).length, 3);
  assert.throws(() => finalReviewerLanePaths({ blindLane: lane('b') }), /fidelityLane receipt is required/);
  assert.throws(() => finalReviewerLanePaths({ measuredTerminal: { lanes: {} } }), /selects no reviewer lane/);
  assert.throws(() => finalReviewerLanePaths({ measuredTerminal: { lanes: { blindLane: {} } } }), /blindLane receipt is required/);
});
