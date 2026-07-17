import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSITION_SECTIONS, SYNTHESIS_AXES, SYNTHESIS_SECTION, validateCompositionContract, validateCompositionContractSource } from '../core/composition-contract/index.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const temp = (): string => mkdtempSync(join(tmpdir(), 'omd-composition-'));
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const refKey = (source: string, component: string): string => `ref-${createHash('sha256').update(`${source}\0${component}`).digest('hex').slice(0, 16)}`;

function setup(withScout = true): { root: string; values: Record<string, string> } {
  const root = temp();
  const omd = join(root, '.omd');
  mkdirSync(omd, { recursive: true });
  const values: Record<string, string> = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
  };
  if (withScout) values['scout.md'] = 'scout-v1';
  for (const [name, value] of Object.entries(values)) writeFileSync(join(omd, name), value);
  return { root, values };
}

function artifact(values: Record<string, string>, scoutNA?: string): string {
  const fingerprint = [
    `- Frame SHA-256: ${hash(values['frame.md']!)}`,
    `- Copy deck SHA-256: ${hash(values['copy-deck.md']!)}`,
    `- Type proof SHA-256: ${hash(values['type-proof.md']!)}`,
    scoutNA ? `- Scout SHA-256: N/A — ${scoutNA}` : `- Scout SHA-256: ${hash(values['scout.md']!)}`,
  ].join('\n');
  return COMPOSITION_SECTIONS.map((section) => `## ${section}\n\n${section === 'Input fingerprint' ? fingerprint : `Decision for ${section}.`}`).join('\n\n');
}
function synthesis(feature = 'Inbox triage workspace', sourceRef = 'LIN-LAYOUT', selector = '[data-region="inbox"]', route = '/inbox'): string {
  const axes = SYNTHESIS_AXES.map((axis, index) => `- ${axis} | ${index === 1 ? 'adapt' : 'N/A'} | ${index === 1 ? 'Queue and detail panel remain visible together.' : 'N/A'} | ${index === 1 ? 'Fit the relationship to the current task flow.' : 'This reference has no evidence for this axis.'}`).join('\n');
  return `## ${SYNTHESIS_SECTION}

### Feature: ${feature}
- Origin: explicit
- Assumption: N/A
- Primitive: Triage and inspect a queue item
- Source ref: ${sourceRef}
- Trust: Directly observed stable reference
- Uncertainty: Content changes may alter the exact density.
- Structural rule: Queue and detail regions maintain a deliberate relationship.
- Adaptation: Map the relationship into the destination task model.
- Token variation: Use destination system tokens rather than source values.
- Conflict resolution: Current task flow and accessibility constraints take precedence.
- Destination route: ${route}
- Destination selector: ${selector}
- Mobile behavior: Recompose queue and detail into a focused drill-in flow.
#### Axes
${axes}`;
}

test('complete matching composition contract passes', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  assert.deepEqual(validateCompositionContract(root), []);
});

test('pure validator accepts supplied digests without filesystem access', () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  assert.deepEqual(validateCompositionContractSource({
    contract: artifact(values),
    frame: hash(values['frame.md']!),
    copyDeck: hash(values['copy-deck.md']!),
    typeProof: hash(values['type-proof.md']!),
    scout: hash(values['scout.md']!),
  }), []);
});

test('missing and empty required H2 sections fail', () => {
  const { root, values } = setup();
  const missing = artifact(values).replace(/## Media roles[\s\S]*?(?=\n## Responsive recomposition)/, '');
  writeFileSync(join(root, '.omd', 'composition.md'), missing);
  assert.ok(validateCompositionContract(root).some((item) => item.path.endsWith('#Media roles')));
  const empty = artifact(values).replace('## Candidate axes\n\nDecision for Candidate axes.', '## Candidate axes\n\n');
  writeFileSync(join(root, '.omd', 'composition.md'), empty);
  assert.ok(validateCompositionContract(root).some((item) => item.path.endsWith('#Candidate axes')));
});

test('Focal hierarchy is an exact required section', () => {
  const { root, values } = setup();
  const missing = artifact(values).replace(/## Focal hierarchy[\s\S]*?(?=\n## Domain form grammar)/, '');
  writeFileSync(join(root, '.omd', 'composition.md'), missing);
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SECTION' && item.path.endsWith('#Focal hierarchy')));
});

test('bad hash format fails without aesthetic judgment', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values).replace(/Frame SHA-256: [0-9a-f]{64}/, 'Frame SHA-256: abc'));
  const findings = validateCompositionContract(root);
  assert.ok(findings.some((item) => item.id === 'COMPOSITION-HASH'));
  assert.ok(findings.every((item) => !/taste|aesthetic|quality/i.test(item.message)));
});

for (const filename of ['frame.md', 'copy-deck.md', 'type-proof.md', 'scout.md']) {
  test(`changed ${filename} makes composition stale`, () => {
    const { root, values } = setup();
    writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
    writeFileSync(join(root, '.omd', filename), 'changed');
    assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-STALE' && item.path.endsWith(filename)));
  });
}

test('absent scout passes only with an explicit N/A reason', () => {
  const { root, values } = setup(false);
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values, 'No durable scout summary was produced for this run.'));
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), artifact({ ...values, 'scout.md': 'fake' }));
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SCOUT'));
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values, 'temporary').replace(/- Scout SHA-256: [^\n]+/, '- Scout SHA-256: N/A —'));
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SCOUT'));
});

test('missing composition file fails explicit command and JSON is stable', () => {
  const { root } = setup(false);
  const missing = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal((JSON.parse(missing.stdout) as Array<{ id: string }>)[0]?.id, 'COMPOSITION-MISSING');
});

test('CLI exits zero for a fresh contract and emits an empty JSON array', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  const result = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.ok(readFileSync(join(root, '.omd', 'composition.md'), 'utf8').includes('## Transfer boundary'));
});

// ── Reference synthesis (conditional on user-origin references) ───────────────

const baseInputs = () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  return {
    values,
    digests: {
      frame: hash(values['frame.md']),
      copyDeck: hash(values['copy-deck.md']),
      typeProof: hash(values['type-proof.md']),
      scout: hash(values['scout.md']),
    },
  };
};

test('no user references means no synthesis requirement', () => {
  const { values, digests } = baseInputs();
  assert.deepEqual(validateCompositionContractSource({ contract: artifact(values), ...digests }), []);
});

test('user references without a Reference synthesis section fail', () => {
  const { values, digests } = baseInputs();
  const findings = validateCompositionContractSource({
    contract: artifact(values),
    ...digests,
    userRefLabels: ['linear.app'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /missing or empty/);
});

test('an empty Reference synthesis section fails the same way', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n## ${SYNTHESIS_SECTION}\n\n`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['linear.app'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
});

test('synthesis ABI rejects missing axes, malformed values, duplicate selectors, and interaction-only transfer', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  assert.deepEqual(validateCompositionContractSource({ contract: complete, ...digests }), []);
  for (const axis of SYNTHESIS_AXES) {
    const missing = complete.replace(new RegExp(`^- ${axis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|[^\\n]*\\n?`, 'm'), '');
    assert.ok(validateCompositionContractSource({ contract: missing, ...digests }).some((finding) => finding.message.includes(`axis "${axis}"`)));
  }
  const duplicateAxis = `${complete}\n- Information architecture/navigation | N/A | N/A | Duplicate axis must be rejected.`;
  assert.ok(validateCompositionContractSource({ contract: duplicateAxis, ...digests }).some((finding) => finding.message.includes('Information architecture/navigation')));
  assert.deepEqual(validateCompositionContractSource({ contract: `${artifact(values)}\n\n${synthesis('Root workspace', 'LIN-LAYOUT', '[data-region="root"]', '/')}`, ...digests }), []);
  const malformed = complete.replace('Macro layout and panel/region geometry | adapt', 'Macro layout and panel/region geometry | copy');
  assert.ok(validateCompositionContractSource({ contract: malformed, ...digests }).some((finding) => finding.message.includes('invalid disposition')));
  const reasonless = complete.replace('- Content density | N/A | N/A | This reference has no evidence for this axis.', '- Content density | N/A | N/A | N/A');
  assert.ok(validateCompositionContractSource({ contract: reasonless, ...digests }).some((finding) => finding.message.includes('N/A reason')));
  const duplicateSelector = `${complete}\n\n${synthesis('Secondary triage workspace', 'NOTION-LAYOUT').replace(/^## Reference synthesis\n+/, '')}`;
  assert.ok(validateCompositionContractSource({ contract: duplicateSelector, ...digests }).some((finding) => finding.message.includes('duplicated')));
  const interactionOnly = complete.replace('Macro layout and panel/region geometry | adapt | Queue and detail panel remain visible together. | Fit the relationship to the current task flow.', 'Macro layout and panel/region geometry | N/A | N/A | No structural transfer is adopted here.');
  assert.ok(validateCompositionContractSource({ contract: interactionOnly, ...digests }).some((finding) => finding.message.includes('interaction-only')));
});
test('every user reference must be mentioned in the synthesis plan', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n${synthesis('Inbox triage workspace', 'LIN-LAYOUT')}`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['LIN-LAYOUT', 'NOTION-LAYOUT'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /NOTION-LAYOUT/);
});

test('a synthesis plan naming every exact reference identity passes', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n${synthesis('Inbox triage workspace', 'LIN-LAYOUT')}\n\n### Decline: Notion document density\n- Origin: explicit
- Source ref: NOTION-LAYOUT
- Trust: User supplied reference
- Uncertainty: Scope is limited to the supplied page.
- Reason: Document density conflicts with rapid queue scanning.`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['LIN-LAYOUT', 'NOTION-LAYOUT'],
  });
  assert.deepEqual(findings, []);
});

test('filesystem adapter derives user reference labels from origin: user records', () => {
  const { root, values } = setup();
  const refsDir = join(root, '.omd', 'refs');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, 'linear.app.page.json'), JSON.stringify({
    source: 'https://linear.app/features', component: 'page', kind: 'page', capturedAt: '2026-01-01',
    invariants: null, principles: [], origin: 'user',
  }));
  writeFileSync(join(refsDir, 'stripe.com.page.json'), JSON.stringify({
    source: 'https://stripe.com', component: 'page', kind: 'page', capturedAt: '2026-01-01',
    invariants: null, principles: [], origin: 'scout',
  }));
  // No synthesis section: only the user ref (linear.app) should be demanded, not the scout ref.
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  const findings = validateCompositionContract(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /missing or empty/);

  const withPlan = `${artifact(values)}\n\n${synthesis('Inbox search workspace', refKey('https://linear.app/features', 'page'))}`;
  writeFileSync(join(root, '.omd', 'composition.md'), withPlan);
  assert.deepEqual(validateCompositionContract(root), []);
});
test('closed parser rejects unknown or duplicate H2 sections and fingerprint keys', () => {
  const { values, digests } = baseInputs();
  const complete = artifact(values);
  for (const contract of [
    `${complete}\n\n## Surprise\n\nNo unowned section.`,
    `${complete}\n\n## Media roles\n\nA duplicate section.`,
    complete.replace('- Frame SHA-256:', `- Frame SHA-256: ${hash(values['frame.md']!)}\n- Frame SHA-256:`),
    `${complete.replace('- Scout SHA-256:', '- Scout SHA-256: deadbeef\n- Scout SHA-256:')}\n`,
    complete.replace('- Type proof SHA-256:', '- Extra SHA-256: ignored\n- Type proof SHA-256:'),
  ]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => /unknown|duplicate H2|exactly once/.test(finding.message)));
  }
});

test('UX task coverage is an allowed auxiliary section and Unicode separators fail closed', () => {
  const { values, digests } = baseInputs();
  const complete = artifact(values);
  const withCoverage = `${complete}\n\n## UX task coverage\n\nT1 | production: / | locator: [data-task="save"] |\n`;
  assert.deepEqual(validateCompositionContractSource({ contract: withCoverage, ...digests }), []);
  const hidden = `${complete}\n\nTask evidence binding:\u2028## UX task coverage\n\nT1 | production: / | locator: [data-task="save"] |\n`;
  assert.ok(validateCompositionContractSource({ contract: hidden, ...digests }).some((finding) => /Unicode line or paragraph separator/.test(finding.message)));
  for (const separator of ['\u2028', '\u2029', '\u0085', '\u000B', '\u000C']) {
    const injected = complete.replace('## Experience spine', `## Experience spine${separator}`);
    assert.ok(validateCompositionContractSource({ contract: injected, ...digests }).some((finding) => /Unicode line or paragraph separator/.test(finding.message)));
  }
});

test('closed synthesis parser rejects unknown fields, stray prose, headings, and malformed cardinality', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  for (const contract of [
    complete.replace('- Primitive:', '- Invented field: unexpected\n- Primitive:'),
    complete.replace('- Trust:', 'This is stray prose.\n- Trust:'),
    complete.replace('#### Axes', '#### Unrecognized heading\n#### Axes'),
    complete.replace('- Mobile behavior:', '- Mobile behavior:\n- Mobile behavior:'),
  ]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => finding.id === 'COMPOSITION-SYNTHESIS'));
  }
});

test('coverage uses exact Source ref fields, retains same-host references, and allows short labels', () => {
  const { values, digests } = baseInputs();
  const first = refKey('https://linear.app/one', 'page');
  const second = refKey('https://linear.app/two', 'page');
  const contract = `${artifact(values)}\n\n${synthesis('UI', first)}\n\n${synthesis('OK', second, '[data-region="secondary"]').replace(/^## Reference synthesis\n+/, '')}`;
  assert.deepEqual(validateCompositionContractSource({ contract, ...digests, userRefLabels: [first, second] }), []);
  const proseOnly = contract.replace(second, 'unmapped-ref').replace('This reference has no evidence for this axis.', `This reference mentions ${second} only in prose.`);
  const findings = validateCompositionContractSource({ contract: proseOnly, ...digests, userRefLabels: [first, second] });
  assert.ok(findings.some((finding) => finding.message.includes(second) && finding.message.includes('exact Source ref')));
});

test('routes and selectors are local, stable, normalized, and diagnostic records identify themselves', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis('Triage', 'FIRST-REF')}`;
  for (const contract of [
    complete.replace('- Destination route: /inbox', '- Destination route: https://example.com'),
    complete.replace('- Destination route: /inbox', '- Destination route: TODO route'),
    complete.replace('- Destination route: /inbox', '- Destination route: //example.com'),
    complete.replace('- Destination route: /inbox', '- Destination route: /todo'),
    complete.replace('[data-region="inbox"]', '.inbox-card'),
    `${complete}\n\n${synthesis('Second', 'SECOND-REF', '[data-region="inbox"]').replace(/^## Reference synthesis\n+/, '')}`,
  ]) {
    const findings = validateCompositionContractSource({ contract, ...digests });
    assert.ok(findings.some((finding) => finding.message.includes('Feature "') && /Destination route|Destination selector/.test(finding.message)));
  }
});

test('source refs and axis rows reject hostname prose and extra columns', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  const hostname = complete.replace('- Source ref: LIN-LAYOUT', '- Source ref: linear.app');
  const extraColumn = complete.replace(
    '- Content density | N/A | N/A | This reference has no evidence for this axis.',
    '- Content density | N/A | N/A | This reference has no evidence for this axis. | injected',
  );
  for (const contract of [hostname, extraColumn]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => finding.id === 'COMPOSITION-SYNTHESIS'));
  }
});

test('long junk and unknown axes cannot be scavenged into valid records', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  const longJunk = `${complete}\n${'unstructured junk '.repeat(20)}`;
  const unknownAxis = complete.replace('- Motion/transition | N/A | N/A | This reference has no evidence for this axis.', '- Spatial spectacle | adapt | A long observed rule. | A long adaptation rule.');
  for (const contract of [longJunk, unknownAxis]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => finding.id === 'COMPOSITION-SYNTHESIS'));
  }
});
