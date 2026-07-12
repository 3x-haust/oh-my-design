import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.ts';
import {
  REQUIRED_SECTIONS,
  INTERACTION_STATES,
  discoverEvidence,
  generateDesignMd,
  parseDesignSections,
  validateDesignMd,
} from '../core/design/index.ts';
import { checkInteractionStates } from '../core/design/interaction-states.ts';
import type { RawIr, RawNode } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-design-'));

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal IR with one interactive input node */
function irWithInput(inputClass = 'email-input'): ReturnType<typeof normalize> {
  const node: RawNode = {
    id: 'n0',
    name: `input.${inputClass}`,
    type: 'FRAME',
    path: `form.login/input.${inputClass}`,
    parent: null,
    box: { x: 0, y: 0, w: 300, h: 44 },
    children: [],
    interactive: true,
  };
  const raw: RawIr = { nodes: [node] };
  return normalize(raw);
}

/** Minimal IR with input + error element */
function irWithInputAndError(errorClass = 'error-message'): ReturnType<typeof normalize> {
  const input: RawNode = {
    id: 'n0',
    name: 'input.email-input',
    type: 'FRAME',
    path: 'form.login/input.email-input',
    parent: null,
    box: { x: 0, y: 0, w: 300, h: 44 },
    children: [],
    interactive: true,
  };
  const errorEl: RawNode = {
    id: 'n1',
    name: `p.${errorClass}`,
    type: 'TEXT',
    path: `form.login/p.${errorClass}`,
    parent: 'n0',
    box: { x: 0, y: 50, w: 300, h: 20 },
    children: [],
    text: 'Email is required.',
  };
  const raw: RawIr = { nodes: [input, errorEl] };
  return normalize(raw);
}

/** Build a complete design.md string with all required sections */
function fullDesignMd(overrideInteractionBody?: string): string {
  const statesBody = overrideInteractionBody ?? INTERACTION_STATES.map(
    (s) => `### ${s.charAt(0).toUpperCase() + s.slice(1)}\nImplemented.\n`,
  ).join('\n');

  return REQUIRED_SECTIONS.map((s) => {
    if (s === 'Interaction states') {
      return `## ${s}\n\n${statesBody}\n`;
    }
    return `## ${s}\n\nContent for ${s}.\n`;
  }).join('\n');
}

// ── parseDesignSections ───────────────────────────────────────────────────────

test('parseDesignSections returns an entry for each h2 heading', () => {
  const md = '## Source of truth\n\nBody text.\n\n## Brand\n\nBrand body.\n';
  const sections = parseDesignSections(md);
  assert.ok(sections.has('source of truth'));
  assert.ok(sections.has('brand'));
  assert.equal(sections.size, 2);
});

test('parseDesignSections handles preamble before first h2', () => {
  const md = '# Design contract\n\nPreamble.\n\n## Brand\n\nContent.\n';
  const sections = parseDesignSections(md);
  assert.ok(sections.has('brand'));
  assert.equal(sections.size, 1);
});

test('parseDesignSections body contains section content', () => {
  const md = '## Brand\n\nPersonality: bold.\n';
  const sections = parseDesignSections(md);
  assert.ok(sections.get('brand')?.includes('bold'));
});

// ── validateDesignMd — section presence ──────────────────────────────────────

test('validateDesignMd passes when all required sections are present', () => {
  const md = fullDesignMd();
  const violations = validateDesignMd(md);
  assert.equal(violations.length, 0, `unexpected violations: ${violations.map((v) => v.value).join(', ')}`);
});

test('validateDesignMd fires DESIGN-INCOMPLETE for each missing section', () => {
  // A document with only "Brand" and "Product goals" — 12 sections missing
  const md = '## Brand\n\nContent.\n\n## Product goals\n\nContent.\n';
  const violations = validateDesignMd(md);
  const ids = new Set(violations.map((v) => v.id));
  assert.ok(ids.has('DESIGN-INCOMPLETE'));
  // 12 sections missing (14 total minus 2 present)
  const missingViolations = violations.filter((v) => v.id === 'DESIGN-INCOMPLETE' && typeof v.value === 'string' && !String(v.value).startsWith('Interaction'));
  assert.ok(missingViolations.length >= 10, `expected >=10 missing-section violations, got ${missingViolations.length}`);
});

test('validateDesignMd fires for every missing section by name', () => {
  const md = '';
  const violations = validateDesignMd(md);
  const missingNames = violations.map((v) => String(v.value));
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      missingNames.some((n) => n === section || n.startsWith(section)),
      `expected DESIGN-INCOMPLETE for "${section}"`,
    );
  }
});

test('validateDesignMd section match is case-insensitive', () => {
  // Mix case in headings — validator should still find them
  const md = REQUIRED_SECTIONS.map((s) => {
    const mixed = s.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');
    if (s === 'Interaction states') {
      return `## ${mixed}\n\n${INTERACTION_STATES.map((st) => `### ${st}\nOk.\n`).join('\n')}\n`;
    }
    return `## ${mixed}\n\nContent.\n`;
  }).join('\n');
  const violations = validateDesignMd(md);
  assert.equal(violations.length, 0, `unexpected violations: ${violations.map((v) => v.value).join(', ')}`);
});

// ── validateDesignMd — interaction states ─────────────────────────────────────

test('validateDesignMd fires DESIGN-INCOMPLETE when Interaction states section has no states', () => {
  const md = fullDesignMd('<!-- to be filled in -->');
  const violations = validateDesignMd(md);
  const blank = violations.filter((v) => String(v.value).includes('Interaction states: (blank)'));
  assert.equal(blank.length, 1, 'expected exactly one blank-section violation');
});

test('validateDesignMd fires for each individually missing state', () => {
  // Section body mentions only "loading" — 5 states missing
  const md = fullDesignMd('### Loading\nImplemented.\n');
  const violations = validateDesignMd(md);
  const missingStates = violations.filter((v) => String(v.value).startsWith('Interaction states: missing'));
  assert.equal(missingStates.length, 5, `expected 5 missing-state violations, got ${missingStates.length}`);
});

test('validateDesignMd does not fire for states that are present', () => {
  // All six states enumerated
  const body = INTERACTION_STATES.map((s) => `### ${s}\nOk.\n`).join('\n');
  const md = fullDesignMd(body);
  const violations = validateDesignMd(md);
  const stateViolations = violations.filter((v) => String(v.value).startsWith('Interaction states'));
  assert.equal(stateViolations.length, 0);
});

test('validateDesignMd state detection is case-insensitive', () => {
  const body = 'LOADING state: skeleton.\nEMPTY state: empty-illustration.\nERROR state: alert.\nSUCCESS: toast.\nDISABLED: tooltip.\nOFFLINE: not required.\n';
  const md = fullDesignMd(body);
  const violations = validateDesignMd(md);
  const stateViolations = violations.filter((v) => String(v.value).startsWith('Interaction states'));
  assert.equal(stateViolations.length, 0);
});

// ── discoverEvidence ──────────────────────────────────────────────────────────

test('discoverEvidence returns null framework when no package.json exists', () => {
  const dir = project();
  const evidence = discoverEvidence(dir);
  assert.equal(evidence.framework, null);
  assert.equal(evidence.dependencies.length, 0);
});

test('discoverEvidence detects react from package.json', () => {
  const dir = project();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
  }));
  const evidence = discoverEvidence(dir);
  assert.equal(evidence.framework, 'react');
});

test('discoverEvidence detects next from package.json', () => {
  const dir = project();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { next: '^14.0.0' },
  }));
  const evidence = discoverEvidence(dir);
  assert.equal(evidence.framework, 'next');
});

test('discoverEvidence picks up frame.md when present', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'frame.md'), '# Frame\nProblem: X. Reframe: Y.');
  const evidence = discoverEvidence(dir);
  assert.ok(evidence.frameMd?.includes('Frame'));
});

test('discoverEvidence counts reference captures', () => {
  const dir = project();
  const refsDir = join(dir, '.omd', 'refs');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, 'cap1.json'), '{}');
  writeFileSync(join(refsDir, 'cap2.json'), '{}');
  const evidence = discoverEvidence(dir);
  assert.equal(evidence.captureCount, 2);
  assert.ok(evidence.captureNames.includes('cap1'));
});

test('discoverEvidence detects token files', () => {
  const dir = project();
  writeFileSync(join(dir, 'tokens.css'), ':root { --color-brand: #f00; }');
  const evidence = discoverEvidence(dir);
  assert.ok(evidence.hasThemeTokens);
  assert.ok(evidence.tokenFilePaths.includes('tokens.css'));
});

// ── generateDesignMd ─────────────────────────────────────────────────────────

test('generateDesignMd produces a document with all required h2 sections', () => {
  const dir = project();
  const evidence = discoverEvidence(dir);
  const md = generateDesignMd(evidence);
  const sections = parseDesignSections(md);
  for (const required of REQUIRED_SECTIONS) {
    const found = [...sections.keys()].some(
      (k) => k.toLowerCase() === required.toLowerCase(),
    );
    assert.ok(found, `generated design.md is missing section "${required}"`);
  }
});

test('generateDesignMd enumerates all interaction states in the Interaction states section', () => {
  const dir = project();
  const evidence = discoverEvidence(dir);
  const md = generateDesignMd(evidence);
  const sections = parseDesignSections(md);
  const interactionBody = [...sections.entries()]
    .find(([k]) => k.toLowerCase() === 'interaction states')?.[1] ?? '';
  for (const state of INTERACTION_STATES) {
    assert.ok(
      interactionBody.toLowerCase().includes(state),
      `generated design.md Interaction states section is missing "${state}"`,
    );
  }
});

test('generateDesignMd includes framework evidence when package.json is present', () => {
  const dir = project();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const evidence = discoverEvidence(dir);
  const md = generateDesignMd(evidence);
  assert.ok(md.includes('react'));
});

test('validateDesignMd passes for the output of generateDesignMd', () => {
  const dir = project();
  const evidence = discoverEvidence(dir);
  const md = generateDesignMd(evidence);
  const violations = validateDesignMd(md);
  // The generated file has all sections and enumerates all states — should pass
  assert.equal(violations.length, 0, `generated design.md has violations: ${violations.map((v) => v.value).join(', ')}`);
});

// ── checkInteractionStates ────────────────────────────────────────────────────

test('DESIGN-FORM-NO-ERROR does not fire when there are no form inputs', () => {
  // A page with only text nodes — no form inputs
  const node: RawNode = {
    id: 'n0', name: 'p.intro', type: 'TEXT', path: 'main/p.intro',
    parent: null, box: { x: 0, y: 0, w: 600, h: 40 }, children: [], text: 'Hello.',
  };
  const ir = normalize({ nodes: [node] } as RawIr);
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 0);
});

test('DESIGN-FORM-NO-ERROR fires when form inputs exist with no error affordance', () => {
  const ir = irWithInput('email-field');
  const violations = checkInteractionStates(ir);
  assert.ok(violations.some((v) => v.id === 'DESIGN-FORM-NO-ERROR'), 'expected DESIGN-FORM-NO-ERROR');
});

test('DESIGN-FORM-NO-ERROR does not fire when an error-class element is present', () => {
  const ir = irWithInputAndError('error-message');
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 0);
});

test('DESIGN-FORM-NO-ERROR does not fire when a .invalid element is present', () => {
  const ir = irWithInputAndError('field-invalid');
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 0);
});

test('DESIGN-FORM-NO-ERROR does not fire when error text is present on the page', () => {
  const input: RawNode = {
    id: 'n0', name: 'input.email', type: 'FRAME', path: 'form/input.email',
    parent: null, box: { x: 0, y: 0, w: 300, h: 44 }, children: [], interactive: true,
  };
  // Text node with error language — no error class but the copy says "error"
  const msg: RawNode = {
    id: 'n1', name: 'span.hint', type: 'TEXT', path: 'form/span.hint',
    parent: null, box: { x: 0, y: 50, w: 300, h: 20 }, children: [],
    text: 'This field contains an error.',
  };
  const ir = normalize({ nodes: [input, msg] } as RawIr);
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 0);
});

test('DESIGN-FORM-NO-ERROR fires only once per page regardless of input count', () => {
  // Three inputs, no error affordance — should fire exactly once
  const nodes: RawNode[] = ['name', 'email', 'password'].map((f, i) => ({
    id: `n${i}`, name: `input.${f}-field`, type: 'FRAME' as const,
    path: `form.register/input.${f}-field`, parent: null,
    box: { x: 0, y: i * 60, w: 300, h: 44 }, children: [], interactive: true,
  }));
  const ir = normalize({ nodes } as RawIr);
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 1);
});

test('DESIGN-FORM-NO-ERROR detects Korean error vocabulary', () => {
  const input: RawNode = {
    id: 'n0', name: 'input.phone', type: 'FRAME', path: 'form/input.phone',
    parent: null, box: { x: 0, y: 0, w: 300, h: 44 }, children: [], interactive: true,
  };
  const msg: RawNode = {
    id: 'n1', name: 'p.msg', type: 'TEXT', path: 'form/p.msg',
    parent: null, box: { x: 0, y: 50, w: 300, h: 20 }, children: [],
    text: '올바르지 않은 전화번호입니다.',
  };
  const ir = normalize({ nodes: [input, msg] } as RawIr);
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 0);
});

test('non-interactive input-like nodes do not trigger DESIGN-FORM-NO-ERROR', () => {
  // A node named "input.search" but interactive: false (never set)
  const node: RawNode = {
    id: 'n0', name: 'input.search', type: 'FRAME', path: 'header/input.search',
    parent: null, box: { x: 0, y: 0, w: 200, h: 36 }, children: [],
    // interactive not set — defaults to undefined, isFormInput returns false
  };
  const ir = normalize({ nodes: [node] } as RawIr);
  const violations = checkInteractionStates(ir);
  assert.equal(violations.filter((v) => v.id === 'DESIGN-FORM-NO-ERROR').length, 0);
});

// ── CLI integration ───────────────────────────────────────────────────────────

test('CLI: omd design creates .omd/design.md in a bare project', () => {
  const dir = project();
  const r = run(['design'], dir);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /Created:/);
  assert.ok(existsSync(join(dir, '.omd', 'design.md')));
});

test('CLI: omd design --check passes on a complete design.md', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'design.md'), generateDesignMd(discoverEvidence(dir)));
  const r = run(['design', '--check'], dir);
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stdout, /ok/);
});

test('CLI: omd design --check exits 1 when sections are missing', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'design.md'), '## Brand\n\nSome content.\n');
  const r = run(['design', '--check'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /DESIGN-INCOMPLETE/);
});

test('CLI: omd design --check exits 0 when no design.md exists', () => {
  const dir = project();
  const r = run(['design', '--check'], dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No .omd\/design.md found/);
});

test('CLI: omd check picks up DESIGN-FORM-NO-ERROR when form inputs lack error state', () => {
  const dir = project();
  const irPath = join(dir, 'page.json');
  const raw: RawIr = {
    nodes: [{
      id: 'n0', name: 'input.email', type: 'FRAME', path: 'form/input.email',
      parent: null, box: { x: 0, y: 0, w: 300, h: 44 }, children: [],
      interactive: true,
    }],
  };
  writeFileSync(irPath, JSON.stringify(raw));
  const r = run(['check', '--ir', irPath, '--no-log'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /DESIGN-FORM-NO-ERROR/);
});

test('CLI: omd check includes DESIGN-INCOMPLETE when design.md has missing sections', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'design.md'), '## Brand\n\nContent.\n');
  const irPath = join(dir, 'page.json');
  const raw: RawIr = {
    nodes: [{ id: 'n0', name: 'div.hero', type: 'FRAME', path: 'div.hero', parent: null, box: { x: 0, y: 0, w: 1440, h: 900 }, children: [] }],
  };
  writeFileSync(irPath, JSON.stringify(raw));
  const r = run(['check', '--ir', irPath, '--no-log'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /DESIGN-INCOMPLETE/);
});

test('CLI: omd check does not report DESIGN-INCOMPLETE when no design.md exists', () => {
  const dir = project();
  const irPath = join(dir, 'page.json');
  const raw: RawIr = {
    nodes: [{ id: 'n0', name: 'div.hero', type: 'FRAME', path: 'div.hero', parent: null, box: { x: 0, y: 0, w: 1440, h: 900 }, children: [] }],
  };
  writeFileSync(irPath, JSON.stringify(raw));
  const r = run(['check', '--ir', irPath, '--no-log'], dir);
  assert.doesNotMatch(r.stdout, /DESIGN-INCOMPLETE/);
});
