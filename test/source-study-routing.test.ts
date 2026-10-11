import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { validateAdaptiveStrategyRails } from '../core/route/adaptive-flow.ts';
import { validateAdaptiveExecutionWaves } from '../core/route/adaptive-execution-waves.ts';

function strategy() {
  const input: unknown = JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  const base = routeAdaptiveFlow(input).strategy;
  const roles = [...new Set([...base.roles, 'omd-study'])];
  const groups = [
    ['omd-framer'], ['omd-scout', 'omd-writer'], ['omd-study'], ['omd-typesetter'],
    ['omd-composer'], ['omd-sketch'], ['omd-hand'], ['omd-eye', 'omd-glance'],
  ];
  return { ...base, roles, methods: [...base.methods, 'provisional-source-study'],
    executionWaves: groups.map((group, index) => ({
      id: `wave-${index}`, mode: 'concurrent' as const, roles: group.filter(role => roles.includes(role)),
    })).filter(wave => wave.roles.length > 0) };
}

test('selected source-study method requires its author and reference-selection stage', () => {
  const selected = strategy();
  assert.doesNotThrow(() => validateAdaptiveStrategyRails(selected));
  assert.throws(() => validateAdaptiveStrategyRails({
    ...selected, roles: selected.roles.filter(role => role !== 'omd-study'),
  }), /REQUIRED_METHOD_MISSING/);
  assert.throws(() => validateAdaptiveStrategyRails({
    ...selected, stages: selected.stages.filter(stage => stage !== 'reference-selection'),
  }), /REQUIRED_METHOD_MISSING/);
});

test('source-aware studies follow selected Scout work and precede type proof', () => {
  const selected = strategy();
  assert.doesNotThrow(() => validateAdaptiveExecutionWaves(selected));
  const early = [...selected.executionWaves];
  const scout = early.findIndex(wave => wave.roles.includes('omd-scout'));
  const study = early.findIndex(wave => wave.roles.includes('omd-study'));
  const type = early.findIndex(wave => wave.roles.includes('omd-typesetter'));
  assert.ok(scout >= 0 && study >= 0 && type >= 0);
  const scoutWave = early[scout], studyWave = early[study], typeWave = early[type];
  assert.ok(scoutWave && studyWave && typeWave);
  early[scout] = studyWave;
  early[study] = scoutWave;
  assert.throws(() => validateAdaptiveExecutionWaves({ ...selected, executionWaves: early }),
    /ADAPTIVE_EXECUTION_WAVE_INVALID/);
  const late = [...selected.executionWaves];
  late[study] = typeWave;
  late[type] = studyWave;
  assert.throws(() => validateAdaptiveExecutionWaves({ ...selected, executionWaves: late }),
    /ADAPTIVE_EXECUTION_WAVE_INVALID/);
});

test('source study can feed type and composition without forcing a separate register evaluation', () => {
  const selected = strategy();
  const withoutRegisterEvaluation = {
    ...selected, stages: selected.stages.filter(stage => stage !== 'art-direction'),
    skips: [...selected.skips, { id: 'art-direction', reason: 'The provisional form study feeds composition; a separate register evaluation is not selected.' }],
  };
  assert.doesNotThrow(() => validateAdaptiveStrategyRails(withoutRegisterEvaluation));
  assert.throws(() => validateAdaptiveStrategyRails({
    ...withoutRegisterEvaluation,
    methods: withoutRegisterEvaluation.methods.filter(method => method !== 'provisional-source-study'),
  }), /REQUIRED_METHOD_MISSING/);
  assert.throws(() => validateAdaptiveStrategyRails({
    ...withoutRegisterEvaluation,
    stages: withoutRegisterEvaluation.stages.filter(stage => stage !== 'composition'),
  }), /REQUIRED_METHOD_MISSING/);
});
