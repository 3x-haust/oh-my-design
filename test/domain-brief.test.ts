import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_BRIEF_SCHEMA,
  DomainBriefError,
  MAX_SURFACES,
  MAX_QUERIES_PER_ROLE,
  validateDomainBrief,
} from '../core/domain/domain-brief.ts';

function baseBrief() {
  return {
    schema: DOMAIN_BRIEF_SCHEMA,
    request: '사내용 ERP 만들어줘',
    domain: 'ERP',
    summary: 'A business resource planner: inventory, purchasing, and accounting in one operational tool.',
    surfaces: [
      { name: 'inventory dashboard', purpose: 'see stock levels and low-stock alerts at a glance' },
      { name: 'purchase order detail', purpose: 'create and track a purchase order through approval' },
    ],
    coreObjects: ['stock item', 'purchase order', 'invoice', 'supplier'],
    audience: 'operations staff who work the tool all day',
    referenceQueries: {
      component: ['dense data table with inline actions', 'approval status pill'],
      craft: ['awwwards dashboard scroll reveal', 'fwa data-viz motion'],
    },
    researched: true,
  };
}

test('validateDomainBrief accepts a well-formed brief and trims/normalizes', () => {
  const brief = validateDomainBrief({ ...baseBrief(), domain: '  ERP  ' });
  assert.equal(brief.schema, 'domain-brief-v1');
  assert.equal(brief.domain, 'ERP');
  assert.equal(brief.surfaces.length, 2);
  assert.equal(brief.referenceQueries.craft.length, 2);
  assert.equal(brief.researched, true);
});

test('validateDomainBrief rejects a wrong schema', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), schema: 'domain-brief-v2' }), DomainBriefError);
});

test('validateDomainBrief rejects unknown or missing keys', () => {
  const extra = { ...baseBrief(), extra: 1 };
  assert.throws(() => validateDomainBrief(extra), /unknown or missing keys/);
  const { audience: _drop, ...missing } = baseBrief();
  assert.throws(() => validateDomainBrief(missing), /unknown or missing keys/);
});

test('validateDomainBrief requires at least one surface, each with name and purpose', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: [] }), /at least/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: [{ name: 'x' }] }), /unknown or missing keys/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: [{ name: '', purpose: 'y' }] }), /non-empty string/);
});

test('validateDomainBrief bounds surface count and rejects duplicate surface names', () => {
  const many = Array.from({ length: MAX_SURFACES + 1 }, (_u, i) => ({ name: `s${i}`, purpose: 'p' }));
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: many }), /bounded to/);
  const dup = [{ name: 'Home', purpose: 'a' }, { name: 'home', purpose: 'b' }];
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: dup }), /repeat a name/);
});

test('validateDomainBrief requires both reference roles to carry queries', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { component: [], craft: ['x'] } }), /component must have at least/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { craft: ['x'] } }), /unknown or missing keys/);
  const tooMany = Array.from({ length: MAX_QUERIES_PER_ROLE + 1 }, (_u, i) => `q${i}`);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { component: tooMany, craft: ['x'] } }), /bounded to/);
});

test('validateDomainBrief requires researched to be a boolean and coreObjects non-empty', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), researched: 'yes' }), /researched must be a boolean/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), coreObjects: [] }), /at least/);
});
