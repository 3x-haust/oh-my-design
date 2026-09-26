import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_BRIEF_SCHEMA,
  DomainBriefError,
  MAX_SURFACES,
  MAX_QUERIES_PER_ROLE,
  requireConfirmedPlanning,
  unconfirmedPlanningStatements,
  validateDomainBrief,
  type DomainBrief,
  type DomainClaimEvidence,
} from '../core/domain/domain-brief.ts';
import type { ExplicitUserEvidence } from '../core/brief/evidence-claims.ts';

const observed: DomainClaimEvidence = { status: 'observed', reference: 'https://example-erp.com/inventory' };
const userProvided: DomainClaimEvidence = { status: 'user-provided', reference: 'user-message' };
const inferred: DomainClaimEvidence = { status: 'inferred', reference: 'prior-knowledge' };

function baseBrief(): DomainBrief {
  return {
    schema: DOMAIN_BRIEF_SCHEMA,
    request: '사내용 ERP 만들어줘',
    domain: 'ERP',
    summary: 'A business resource planner: inventory, purchasing, and accounting in one operational tool.',
    surfaces: [
      {
        name: 'inventory dashboard',
        purpose: 'see stock levels and low-stock alerts at a glance',
        evidence: [observed],
      },
      {
        name: 'purchase order detail',
        purpose: 'create and track a purchase order through approval',
        evidence: [userProvided],
      },
    ],
    coreObjects: [
      { name: 'stock item', evidence: [observed] },
      { name: 'purchase order', evidence: [userProvided] },
      { name: 'invoice', evidence: [observed] },
      { name: 'supplier', evidence: [inferred, observed] },
    ],
    audience: {
      description: 'operations staff who work the tool all day',
      evidence: [userProvided],
    },
    referenceQueries: {
      component: ['dense data table with inline actions', 'approval status pill'],
      craft: ['awwwards dashboard scroll reveal', 'fwa data-viz motion'],
      mood: ['printed ledger, low-contrast, dense but quiet'],
    },
    planning: {
      businessGoal: {
        text: 'Replace the spreadsheet the ops team maintains by hand',
        userEvidence: [{
          kind: 'explicit-user-evidence' as const,
          source: 'user-message' as const,
          reference: 'request',
          excerpt: '사내용 ERP 만들어줘 — 엑셀로 관리하다가 너무 힘들어서',
        }],
      },
      successSignal: {
        text: 'the ops team stops keeping a parallel spreadsheet',
        userEvidence: [{
          kind: 'explicit-user-evidence' as const,
          source: 'user-message' as const,
          reference: 'request',
          excerpt: '엑셀 안 쓰게 되는 게 목표예요',
        }],
      },
      nonGoals: [{
        text: 'no accounting exports in the first release',
        userEvidence: [{
          kind: 'explicit-user-evidence' as const,
          source: 'user-provided-artifact' as const,
          reference: 'scope.md',
          excerpt: '회계 내보내기는 이번 범위 아님',
        }],
      }],
    },
  };
}

test('validateDomainBrief accepts a well-formed brief and trims/normalizes', () => {
  const brief = validateDomainBrief({ ...baseBrief(), domain: '  ERP  ' });
  assert.equal(brief.schema, 'domain-brief-v1');
  assert.equal(brief.domain, 'ERP');
  assert.equal(brief.surfaces.length, 2);
  assert.equal(brief.referenceQueries.craft.length, 2);
  assert.equal(brief.audience.description, 'operations staff who work the tool all day');
  assert.deepEqual(brief.surfaces[0]?.evidence, [observed]);
  assert.equal(brief.coreObjects[0]?.name, 'stock item');
});

test('domain brief preserves the complete request bytes including boundary whitespace', () => {
  const request = '\n  # Full request\r\n' + 'Required screen and recovery behavior.\n'.repeat(600) + '\n';
  const brief = validateDomainBrief({ ...baseBrief(), request });
  assert.equal(brief.request, request);
});

test('domain brief can represent all seventeen requested product screens independently', () => {
  const surfaces = Array.from({ length: 17 }, (_, index) => ({
    name: `Screen ${index + 1}`, purpose: `Complete task ${index + 1}`, evidence: [userProvided],
  }));
  const brief = validateDomainBrief({ ...baseBrief(), surfaces });
  assert.deepEqual(brief.surfaces, surfaces);
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

test('validateDomainBrief no longer accepts a self-reported researched boolean', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), researched: true }), /unknown or missing keys/);
});

test('validateDomainBrief requires at least one surface, each with name, purpose, and a source', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: [] }), /at least/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: [{ name: 'x' }] }), /unknown or missing keys/);
  assert.throws(
    () => validateDomainBrief({ ...baseBrief(), surfaces: [{ name: '', purpose: 'y', evidence: [observed] }] }),
    /non-empty string/,
  );
  assert.throws(
    () => validateDomainBrief({ ...baseBrief(), surfaces: [{ name: 'x', purpose: 'y' }] }),
    /unknown or missing keys/,
  );
});

test('validateDomainBrief fails an unsourced surface, object, or audience with UNSOURCED_DOMAIN_CLAIM', () => {
  const inferredOnly: DomainClaimEvidence[] = [inferred];
  const unsourcedSurface = changed((brief) => {
    brief.surfaces[0]!.evidence = inferredOnly;
  });
  assert.throws(
    () => validateDomainBrief(unsourcedSurface),
    (error: unknown) => error instanceof DomainBriefError && error.code === 'UNSOURCED_DOMAIN_CLAIM',
  );

  const unsourcedObject = changed((brief) => {
    brief.coreObjects[0]!.evidence = inferredOnly;
  });
  assert.throws(
    () => validateDomainBrief(unsourcedObject),
    (error: unknown) => error instanceof DomainBriefError && error.code === 'UNSOURCED_DOMAIN_CLAIM',
  );

  const unsourcedAudience = changed((brief) => {
    brief.audience.evidence = inferredOnly;
  });
  assert.throws(
    () => validateDomainBrief(unsourcedAudience),
    (error: unknown) => error instanceof DomainBriefError && error.code === 'UNSOURCED_DOMAIN_CLAIM',
  );
});

test('validateDomainBrief accepts a mixed chain as long as one observation or user artifact stands behind it', () => {
  const mixed = changed((brief) => {
    brief.surfaces[0]!.evidence = [inferred, userProvided];
  });
  assert.doesNotThrow(() => validateDomainBrief(mixed));
});

test('validateDomainBrief rejects an empty evidence list and an unknown status', () => {
  const empty = changed((brief) => {
    brief.surfaces[0]!.evidence = [];
  });
  assert.throws(() => validateDomainBrief(empty), /at least one source/);

  const unknownStatus = changed((brief) => {
    brief.audience.evidence = [{ status: 'guessed', reference: 'https://example.com' } as unknown as DomainClaimEvidence];
  });
  assert.throws(() => validateDomainBrief(unknownStatus), /must be observed, user-provided, or inferred/);
});

test('validateDomainBrief bounds surface count and rejects duplicate surface names', () => {
  const many = Array.from({ length: MAX_SURFACES + 1 }, (_u, i) => ({
    name: `s${i}`, purpose: 'p', evidence: [observed],
  }));
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: many }), /bounded to/);
  const dup = [
    { name: 'Home', purpose: 'a', evidence: [observed] },
    { name: 'home', purpose: 'b', evidence: [observed] },
  ];
  assert.throws(() => validateDomainBrief({ ...baseBrief(), surfaces: dup }), /repeat a name/);
});

test('validateDomainBrief requires all three reference roles to carry queries', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { component: [], craft: ['x'], mood: ['m'] } }), /component must have at least/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { craft: ['x'], mood: ['m'] } }), /unknown or missing keys/);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { component: ['c'], craft: ['x'] } }), /unknown or missing keys/);
  const tooMany = Array.from({ length: MAX_QUERIES_PER_ROLE + 1 }, (_u, i) => `q${i}`);
  assert.throws(() => validateDomainBrief({ ...baseBrief(), referenceQueries: { component: tooMany, craft: ['x'], mood: ['m'] } }), /bounded to/);
});

test('validateDomainBrief requires coreObjects to be sourced entries and non-empty', () => {
  assert.throws(() => validateDomainBrief({ ...baseBrief(), coreObjects: [] }), /at least/);
  assert.throws(
    () => validateDomainBrief({ ...baseBrief(), coreObjects: ['stock item'] }),
    /must be an object/,
  );
  const duplicated = [
    { name: 'stock item', evidence: [observed] },
    { name: 'Stock Item', evidence: [observed] },
  ];
  assert.throws(() => validateDomainBrief({ ...baseBrief(), coreObjects: duplicated }), /repeat a name/);
});

test('planning intent is confirmed only when the user actually said it', () => {
  const brief = validateDomainBrief(baseBrief());
  assert.deepEqual(unconfirmedPlanningStatements(brief.planning), []);
  assert.doesNotThrow(() => requireConfirmedPlanning(brief.planning));

  const hypothesized = validateDomainBrief(changed((draft) => {
    delete draft.planning.businessGoal.userEvidence;
  }));
  assert.deepEqual(unconfirmedPlanningStatements(hypothesized.planning), ['businessGoal']);
  assert.throws(
    () => requireConfirmedPlanning(hypothesized.planning),
    (error: unknown) => error instanceof DomainBriefError && error.code === 'UNSOURCED_PLANNING_CLAIM',
  );
});

test('planning rejects a fabricated user evidence entry', () => {
  const bogusSource = changed((draft) => {
    draft.planning.successSignal.userEvidence = [{
      kind: 'explicit-user-evidence' as const,
      source: 'model-assumption' as unknown as ExplicitUserEvidence['source'],
      reference: 'request',
      excerpt: 'invented',
    }];
  });
  assert.throws(() => validateDomainBrief(bogusSource), /must be user-message or user-provided-artifact/);

  const emptyEvidence = changed((draft) => {
    draft.planning.successSignal.userEvidence = [];
  });
  assert.throws(() => validateDomainBrief(emptyEvidence), /at least one explicit user evidence entry/);

  const missingExcerpt = changed((draft) => {
    draft.planning.nonGoals[0]!.userEvidence = [{
      kind: 'explicit-user-evidence' as const,
      source: 'user-message' as const,
      reference: 'scope.md',
      excerpt: '',
    }];
  });
  assert.throws(() => validateDomainBrief(missingExcerpt), /excerpt must be a non-empty string/);
});

test('validateDomainBrief requires planning to name a goal, a success signal, and non-goals', () => {
  const { planning: _drop, ...withoutPlanning } = baseBrief();
  assert.throws(() => validateDomainBrief(withoutPlanning), /unknown or missing keys/);

  const shapeless = changed((draft) => {
    delete (draft.planning as Partial<typeof draft.planning>).successSignal;
  });
  assert.throws(() => validateDomainBrief(shapeless), /planning has unknown or missing keys/);

  const noNonGoals = changed((draft) => {
    (draft.planning as { nonGoals: unknown }).nonGoals = 'none';
  });
  assert.throws(() => validateDomainBrief(noNonGoals), /nonGoals must be an array/);

  const emptyGoal = changed((draft) => {
    draft.planning.businessGoal.text = '   ';
  });
  assert.throws(() => validateDomainBrief(emptyGoal), /businessGoal.text must be a non-empty string/);
});

function changed(update: (brief: MutableBrief) => void): unknown {
  const brief = structuredClone(baseBrief()) as unknown as MutableBrief;
  update(brief);
  return brief;
}

type MutableBrief = {  surfaces: Array<{ name: string; purpose: string; evidence: DomainClaimEvidence[] }>;
  coreObjects: Array<{ name: string; evidence: DomainClaimEvidence[] }>;
  audience: { description: string; evidence: DomainClaimEvidence[] };
  planning: {
    businessGoal: { text: string; userEvidence?: ExplicitUserEvidence[] };
    successSignal: { text: string; userEvidence?: ExplicitUserEvidence[] };
    nonGoals: Array<{ text: string; userEvidence?: ExplicitUserEvidence[] }>;
  };
};

// The boundary a real run crossed: it opened welfare portals to learn the domain, then cited those
// same captures as the visual basis of its sections, and shipped a survey of portals whose primary
// subject the user had already called badly designed.
test('domain observation records a domain fact, never a design reference', () => {
  const brief = validateDomainBrief(baseBrief());
  const observed = brief.surfaces[0]!.evidence[0]!;

  // The capture path is a domain source and is recorded as one.
  assert.equal(observed.status, 'observed');
  assert.match(observed.reference, /^(?:https?:|user-message|\.omd\/captures\/)/, 'a domain source names a URL, a capture, or the user');

  // Nothing in the brief carries a visual basis: the schema has no field for one. A visual decision
  // belongs to the reference board under `.omd/refs/`, which is a different artifact entirely.
  const serialized = JSON.stringify(brief);
  assert.equal(Object.hasOwn(brief, 'visualBasis'), false);
  assert.equal(/\.omd\/refs\//.test(serialized), false, 'a domain brief must not cite a reference capture');
});

test('an unsourced domain claim says what the observation does and does not establish', () => {
  const inferredOnly: DomainClaimEvidence[] = [{ status: 'inferred', reference: 'prior-knowledge' }];
  const unsourced = changed((draft) => {
    draft.surfaces[0]!.evidence = inferredOnly;
  });
  assert.throws(
    () => validateDomainBrief(unsourced),
    (error: unknown) =>
      error instanceof DomainBriefError
      && error.code === 'UNSOURCED_DOMAIN_CLAIM'
      // The message must not let a reader mistake an observation for a design endorsement.
      && /domain FACT/.test(error.message)
      && /not a design reference/.test(error.message),
  );
});
