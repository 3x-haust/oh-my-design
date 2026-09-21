import assert from 'node:assert/strict';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { parseTaskFlowBenchmark } from '../core/ref/task-flow-benchmark.ts';

const contract = () => inputSkeleton('task-flow-benchmark');
const parsedExample = () => parseTaskFlowBenchmark(contract().skeleton);

test('public benchmark example teaches both honest bounded gaps and complete coverage', () => {
  const example = parsedExample();
  const bounded = example.sources.find(source => source.coverage.status === 'bounded-gap');
  assert.ok(bounded, 'public example must show the required nonempty exclusion shape');
  assert.equal(bounded.coverage.excludedTargets.length, 1);
  assert.deepEqual(Object.keys(bounded.coverage.excludedTargets[0] ?? {}), ['id', 'url', 'category', 'reason']);
  assert.equal(bounded.coverage.discoveredTargetCount, bounded.screens.length + 1);
  const complete = example.sources.find(source => source.coverage.status === 'complete');
  assert.ok(complete, 'preserve the zero-exclusion complete branch');
  assert.deepEqual(complete.coverage.excludedTargets, []);
  const guidance = contract().constraints?.join('\n') ?? '';
  assert.match(guidance, /excludedTargets[\s\S]*id[\s\S]*url[\s\S]*category[\s\S]*reason/);
  assert.match(guidance, /discoveredTargetCount[\s\S]*screens\.length \+ excludedTargets\.length/);
});

test('public bounded-gap authoring keeps malformed exclusions and false counts refused', () => {
  const example = parsedExample();
  const source = example.sources[0];
  assert.ok(source);
  const exclusion = { id: 'login', url: `${source.url}/account`, category: 'authentication', reason: 'Login is outside safe public traversal.' };
  const input = (excludedTargets: readonly unknown[], count: number) => ({
    ...example,
    sources: [{ ...source, coverage: { ...source.coverage, status: 'bounded-gap', excludedTargets, discoveredTargetCount: count } }, ...example.sources.slice(1)],
  });
  const validCount = source.screens.length + 1;
  assert.throws(() => parseTaskFlowBenchmark(input(['login required'], validCount)), /EXCLUDED_TARGET_INVALID/);
  assert.throws(() => parseTaskFlowBenchmark(input([{ url: exclusion.url, reason: exclusion.reason }], validCount)), /EXCLUDED_TARGET_KEYS/);
  assert.throws(() => parseTaskFlowBenchmark(input([exclusion], source.screens.length)), /DISCOVERED_TARGET_COUNT/);
  assert.doesNotThrow(() => parseTaskFlowBenchmark(input([exclusion], validCount)));
  assert.deepEqual(example, parsedExample(), 'input rejection must not mutate the public example');
});
