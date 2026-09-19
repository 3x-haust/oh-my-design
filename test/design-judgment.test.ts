import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DESIGN_JUDGMENT_SCHEMA,
  DesignJudgmentError,
  checkDesignHypothesis,
  parseDesignHypothesis,
  parseDesignJudgmentRecord,
  parseReferenceJudgment,
} from '../core/design/judgment.ts';
import {
  DESIGN_JUDGMENT_MARKDOWN_PATH,
  DESIGN_JUDGMENT_PATH,
  publishDesignJudgment,
  readDesignJudgment,
} from '../core/design/judgment-files.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const boardSha = 'a'.repeat(64);
const hypothesis = {
  schema: DESIGN_JUDGMENT_SCHEMA,
  feelsLike: 'a personal administrative workspace, not a government portal',
  dominantObject: 'benefit cards',
  subordinate: ['sidebar navigation', 'search', 'filters', 'AI assistant'],
  densityIntent: 'show several benefits in one viewport so a person can compare them without feeling like a spreadsheet',
  trustSource: 'explicit eligibility, match, provider, deadline, and next action metadata',
  twoSecondRead: 'find benefits that fit me',
};

const judgment = {
  id: 'public-portal',
  observation: 'search-led entry, icon shortcuts, five top-level sections, and dense informational rows',
  whyItWorksThere: 'a government portal serves broad navigation and must expose many destinations immediately',
  relevance: 'low',
  adopt: ['keep a visible search entry for known tasks'],
  reject: ['do not make navigation the visual subject', 'do not reproduce the dense portal chrome'],
  interpretation: 'use search as a fast entry, then move the matching benefit cards into the dominant field',
  scope: 'surface',
};

const record = {
  schema: DESIGN_JUDGMENT_SCHEMA,
  referenceBoardSha256: boardSha,
  hypothesis,
  judgments: [judgment],
};

test('reference judgment separates observation, why-it-works-there, transfer, and interpretation', () => {
  const parsed = parseReferenceJudgment(judgment, 0);
  assert.equal(parsed.observation.startsWith('search-led'), true);
  assert.equal(parsed.whyItWorksThere.includes('government portal'), true);
  assert.equal(parsed.relevance, 'low');
  assert.equal(parsed.scope, 'surface');
  assert.ok(parsed.reject.length > 0);
});

test('a verdict disguised as an observation is rejected', () => {
  assert.throws(
    () => parseReferenceJudgment({ ...judgment, observation: 'square corners are trustworthy' }, 0),
    (error: unknown) => error instanceof DesignJudgmentError && error.code === 'JUDGMENT_MISSING_WHY',
  );
});

test('low-relevance evidence cannot become a product-wide rule', () => {
  assert.throws(
    () => parseReferenceJudgment({ ...judgment, scope: 'product-wide' }, 0),
    (error: unknown) => error instanceof DesignJudgmentError && error.code === 'JUDGMENT_OVERREACH',
  );
  assert.doesNotThrow(() => parseReferenceJudgment({ ...judgment, relevance: 'high', scope: 'product-wide' }, 0));
});

test('the hypothesis rejects generic adjectives and vague dominant objects', () => {
  const generic = parseDesignHypothesis({
    ...hypothesis,
    feelsLike: 'a modern, clean product',
    dominantObject: 'cards',
    twoSecondRead: 'help',
  });
  const findings = checkDesignHypothesis(generic);
  assert.ok(findings.some((finding) => finding.includes('interchangeable adjective')));
  assert.ok(findings.some((finding) => finding.includes('twoSecondRead')));
  assert.ok(findings.some((finding) => finding.includes('dominantObject')));
});

test('a complete judgment record parses and round-trips', () => {
  const parsed = parseDesignJudgmentRecord(record);
  assert.equal(parsed.hypothesis.dominantObject, 'benefit cards');
  assert.equal(parsed.judgments[0]?.interpretation.includes('benefit cards'), true);
});

test('judgment publish persists immutable record plus human markdown and reads it back', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-judgment-'));
  const invocation = createTestProjectRunInvocation(root);
  const pointer = publishDesignJudgment(root, record, createTestProjectWriteAdapter(root, invocation));
  assert.equal(pointer.referenceBoardSha256, boardSha);
  assert.ok(readFileSync(join(root, DESIGN_JUDGMENT_PATH), 'utf8').includes(pointer.sha256));
  const markdown = readFileSync(join(root, DESIGN_JUDGMENT_MARKDOWN_PATH), 'utf8');
  assert.match(markdown, /benefit cards/);
  assert.match(markdown, /Why it works there/);
  assert.deepEqual(readDesignJudgment(root), parseDesignJudgmentRecord(record));
});

test('a changed judgment record is detected through its pointer digest', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-judgment-stale-'));
  const invocation = createTestProjectRunInvocation(root);
  const pointer = publishDesignJudgment(root, record, createTestProjectWriteAdapter(root, invocation));
  const recordPath = join(root, '.omd', 'design-judgments', `sha256-${pointer.sha256}.json`);
  const changed = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>;
  changed.referenceBoardSha256 = 'b'.repeat(64);
  createTestProjectWriteAdapter(root, invocation).write(`.omd/design-judgments/sha256-${pointer.sha256}.json`, `${JSON.stringify(changed)}\n`);
  assert.throws(() => readDesignJudgment(root), /stale/);
});
