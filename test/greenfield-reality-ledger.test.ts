import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatBrief, projectRealityForBrief, type Brief } from '../core/brief/index.ts';
import {
  parseRealityLedger,
  readFrame,
} from '../core/frame/index.ts';
import { writeFrame } from '../core/frame/write.ts';
import {
  assertGreenfieldRealityFit,
  REALITY_FIT_PASS_VALUE,
} from '../core/evidence/final-v2-adaptive-files.ts';
import { assertArtSelectedGreenfieldRealityFit } from '../core/evidence/final-v2-graph.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { parseEvidenceClaimPublication } from '../core/brief/evidence-claims.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import {
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

const fixturePath = fileURLToPath(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url));
const fixture = (): unknown => JSON.parse(readFileSync(fixturePath, 'utf8'));

const reality = parseRealityLedger({
  schema: 'reality-ledger-v1',
  mode: 'greenfield',
  facts: [
    { category: 'subject', status: 'supplied', statement: '사용자는 기사 방문 시간을 선택한다.' },
    { category: 'brand', status: 'unknown', statement: '브랜드는 제공되지 않았다.' },
    { category: 'person', status: 'unknown', statement: '기사 이름과 신원은 제공되지 않았다.' },
  ],
});

const frameFrontmatter = () => ({
  generator: 'omd-framer',
  revision: 0,
  reality,
  ux: {
    schema: 'task-coverage-matrix-v1',
    tasks: [{
      id: 'book-visit',
      user: '누수 접수 사용자',
      trigger: '방문 예약 화면 진입',
      outcome: '방문 시간과 입장 방법 확정',
      frequent: true,
      risk: 'medium',
      states: ['empty', 'ready', 'success'],
      errorRecovery: '선택을 수정한다.',
      exit: '예약 목록으로 돌아간다.',
      mobile: '엄지 영역에서 주 행동을 완료한다.',
      evidence: {
        probe: 'visit-booking',
        capture: 'booking-success',
        receipt: '.omd/evidence/receipts/booking-success.json',
      },
    }],
  },
});

test('greenfield route and frame persist one bounded reality ledger', () => {
  const routed = routeAdaptiveFlow(fixture());
  assert.equal(routed.projectMode, 'greenfield');
  assert.ok(routed.strategy.stages.includes('frame'));

  const root = mkdtempSync(join(tmpdir(), 'omd-greenfield-reality-'));
  writeFrame(root, frameFrontmatter(), '# Frame\n\nPrompt-only repair booking.', createTestProjectWriteAdapter(root));
  const stored = readFrame(root);
  assert.ok(stored !== null);
  assert.deepEqual(stored.reality, reality);
});

test('production and final review briefs receive the persisted reality boundary', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-greenfield-brief-'));
  writeFrame(root, frameFrontmatter(), '# Frame\n\nPrompt-only repair booking.', createTestProjectWriteAdapter(root));

  for (const stage of ['production', 'independent-review'] as const) {
    const projected = projectRealityForBrief(root, stage, 'greenfield');
    assert.equal(projected.blocker, null);
    assert.deepEqual(projected.reality, reality);
  }
  const formatted = formatBrief({
    stage: 'independent-review',
    owner: 'omd-eye',
    owns: [],
    route: {
      name: 'adaptive',
      projectMode: 'greenfield',
      roles: ['omd-eye'],
      references: 'skip — prompt-only',
    },
    contentGrain: null,
    localeDesign: null,
    reality,
    references: [],
    referencesOmitted: 0,
    contracts: [],
    schemas: [],
    shell: null,
    judgedBy: [],
    prior: [],
    blockers: [],
  } satisfies Brief);
  assert.match(formatted, /brand\/unknown: 브랜드는 제공되지 않았다\./);
});

test('greenfield final evidence cannot pass without the machine authenticity verdict', () => {
  assert.doesNotThrow(() => assertGreenfieldRealityFit('existing', 'ordinary visual verdict'));
  assert.throws(
    () => assertGreenfieldRealityFit('greenfield', 'ordinary visual verdict'),
    (error: unknown) => error instanceof Error && error.message.includes('realityFit'),
  );
  assert.doesNotThrow(() => assertGreenfieldRealityFit(
    'greenfield',
    REALITY_FIT_PASS_VALUE,
  ));
  assert.throws(
    () => assertArtSelectedGreenfieldRealityFit('greenfield', {
      blindVisual: 'GREEN',
      blindNarrative: 'GREEN',
    }),
    (error: unknown) => error instanceof Error && error.message.includes('realityFit'),
  );
  assert.doesNotThrow(() => assertArtSelectedGreenfieldRealityFit('greenfield', {
    blindVisual: 'GREEN',
    blindNarrative: 'GREEN',
    realityFit: REALITY_FIT_PASS_VALUE,
  }));
});

test('route schema models working context as hypothesis claim references', () => {
  const route = inputSkeleton('route-input').skeleton as {
    evidenceClaims: {
      claims: Array<{ id: string; status: string }>;
      workingContext: string[];
    };
  };
  assert.doesNotThrow(() => parseEvidenceClaimPublication(route.evidenceClaims));
  assert.ok(route.evidenceClaims.workingContext.length > 0);
  for (const reference of route.evidenceClaims.workingContext) {
    assert.equal(
      route.evidenceClaims.claims.find((claim) => claim.id === reference)?.status,
      'hypothesis',
    );
  }
});
