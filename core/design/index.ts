import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Violation } from '../types.ts';

// ── Section schema ────────────────────────────────────────────────────────────

/**
 * The fourteen required sections of a `.omd/design.md` contract.
 *
 * Section names are matched case-insensitively against the document's h2
 * headings (## Heading). The order is canonical but the validator does not
 * enforce order — only presence.
 */
export const REQUIRED_SECTIONS = [
  'Source of truth',
  'Brand',
  'Product goals',
  'Personas & jobs',
  'Information architecture',
  'Design principles',
  'Visual language',
  'Components',
  'Accessibility',
  'Responsive behavior',
  'Interaction states',
  'Content voice',
  'Implementation constraints',
  'Open questions',
] as const;

export type DesignSection = (typeof REQUIRED_SECTIONS)[number];

/**
 * The six interaction states that must be enumerated in the "Interaction states"
 * section. Each state is either implemented or explicitly skipped with a reason.
 * The validator flags when the section exists but none of these words appear.
 */
export const INTERACTION_STATES = [
  'loading',
  'empty',
  'error',
  'success',
  'disabled',
  'offline',
] as const;

export type InteractionState = (typeof INTERACTION_STATES)[number];

// ── Evidence scanner ──────────────────────────────────────────────────────────

export interface Evidence {
  framework: string | null;
  dependencies: string[];
  hasThemeTokens: boolean;
  tokenFilePaths: string[];
  surfaceCount: number;
  surfacePaths: string[];
  frameMd: string | null;
  decisionsMd: string | null;
  attributionMd: string | null;
  captureCount: number;
  captureNames: string[];
  hasMotionSpec: boolean;
  hasVoiceStudy: boolean;
}

/**
 * Scan the project at `cwd` for design evidence. Returns everything that can
 * be inferred without rendering a page. Unknowns stay null; the generator
 * converts them to open questions rather than invented values.
 */
export function discoverEvidence(cwd: string): Evidence {
  const evidence: Evidence = {
    framework: null,
    dependencies: [],
    hasThemeTokens: false,
    tokenFilePaths: [],
    surfaceCount: 0,
    surfacePaths: [],
    frameMd: null,
    decisionsMd: null,
    attributionMd: null,
    captureCount: 0,
    captureNames: [],
    hasMotionSpec: false,
    hasVoiceStudy: false,
  };

  // package.json — framework and dependency fingerprint
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const all = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      const names = Object.keys(all);
      evidence.dependencies = names;

      if (names.some((n) => n === 'next' || n === '@next/core-web-vitals')) evidence.framework = 'next';
      else if (names.includes('react')) evidence.framework = 'react';
      else if (names.includes('vue')) evidence.framework = 'vue';
      else if (names.some((n) => n === 'svelte' || n === '@sveltejs/kit')) evidence.framework = 'svelte';
    } catch { /* corrupt package.json — skip */ }
  }

  // Token / theme files — CSS custom properties, tailwind config
  const tokenCandidates = [
    'src/styles/tokens.css',
    'src/styles/variables.css',
    'src/tokens.css',
    'tokens.css',
    'styles/tokens.css',
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.cjs',
    'theme.ts',
    'theme.js',
    'src/theme.ts',
    'src/theme.js',
  ];
  for (const rel of tokenCandidates) {
    const abs = join(cwd, rel);
    if (existsSync(abs)) {
      evidence.hasThemeTokens = true;
      evidence.tokenFilePaths.push(rel);
    }
  }

  // Surface discovery — count HTML/page/route files as a proxy for surface count
  const surfaceDirs = ['src/app', 'src/pages', 'pages', 'src/routes', 'routes'];
  for (const dir of surfaceDirs) {
    const abs = join(cwd, dir);
    if (!existsSync(abs)) continue;
    try {
      const files = readdirSync(abs, { recursive: true }) as string[];
      const pages = files.filter((f) =>
        f.endsWith('.tsx') || f.endsWith('.jsx') ||
        f.endsWith('.vue') || f.endsWith('.svelte') ||
        f.endsWith('.html'),
      );
      if (pages.length > 0) {
        evidence.surfacePaths.push(...pages.slice(0, 20).map((f) => `${dir}/${f}`));
        evidence.surfaceCount += pages.length;
      }
    } catch { /* unreadable — skip */ }
  }
  // Fallback: count HTML files at root and dist/
  if (evidence.surfaceCount === 0) {
    for (const dir of [cwd, join(cwd, 'dist'), join(cwd, 'public')]) {
      if (!existsSync(dir)) continue;
      try {
        const files = readdirSync(dir);
        const htmlFiles = files.filter((f) => f.endsWith('.html') || f.endsWith('.htm'));
        evidence.surfaceCount += htmlFiles.length;
        evidence.surfacePaths.push(...htmlFiles.map((f) => dir === cwd ? f : `${join(dir, f).slice(cwd.length + 1)}`));
      } catch { /* skip */ }
    }
  }

  // .omd/ artifacts
  const omdDir = join(cwd, '.omd');
  const framePath = join(omdDir, 'frame.md');
  if (existsSync(framePath)) evidence.frameMd = readFileSync(framePath, 'utf8');

  const decisionsPath = join(omdDir, 'decisions.md');
  if (existsSync(decisionsPath)) evidence.decisionsMd = readFileSync(decisionsPath, 'utf8');

  const attrPath = join(omdDir, 'attribution.md');
  if (existsSync(attrPath)) evidence.attributionMd = readFileSync(attrPath, 'utf8');

  const motionSpecPath = join(omdDir, 'motion-spec.md');
  if (existsSync(motionSpecPath)) evidence.hasMotionSpec = true;

  const voiceStudyPath = join(omdDir, 'voice-study.md');
  if (existsSync(voiceStudyPath)) evidence.hasVoiceStudy = true;

  const refsDir = join(omdDir, 'refs');
  if (existsSync(refsDir)) {
    try {
      const jsonFiles = readdirSync(refsDir).filter((f) => f.endsWith('.json'));
      evidence.captureCount = jsonFiles.length;
      evidence.captureNames = jsonFiles.map((f) => f.slice(0, -5));
    } catch { /* skip */ }
  }

  return evidence;
}

// ── Design.md generator ───────────────────────────────────────────────────────

/**
 * Generate the initial `.omd/design.md` content from discovered evidence.
 *
 * The file is an English-language design contract. Every field that cannot be
 * inferred from evidence becomes an explicit open question rather than an
 * invented value. A bare project with no evidence produces a skeleton that the
 * designer fills in; a project with frame.md and token files produces a
 * partially-populated contract.
 */
export function generateDesignMd(evidence: Evidence): string {
  const now = new Date().toISOString().slice(0, 10);

  const surfaceSummary = evidence.surfaceCount > 0
    ? `${evidence.surfaceCount} surface${evidence.surfaceCount === 1 ? '' : 's'} detected: ${evidence.surfacePaths.slice(0, 5).join(', ')}${evidence.surfaceCount > 5 ? ` (+${evidence.surfaceCount - 5} more)` : ''}`
    : 'No surfaces detected — add routes or HTML files';

  const frameSummary = evidence.frameMd
    ? `Derived from .omd/frame.md:\n  ${evidence.frameMd.split('\n').slice(0, 3).join('\n  ')}`
    : 'Open question — run `omd frame set` to establish the problem statement';

  const frameworkNote = evidence.framework
    ? `${evidence.framework} (detected via package.json)`
    : evidence.dependencies.length > 0
      ? 'No recognised framework — plain HTML or unknown stack'
      : 'No package.json found — unknown stack';

  const tokenNote = evidence.hasThemeTokens
    ? `Token files found: ${evidence.tokenFilePaths.join(', ')}`
    : 'No token files found — define `:root` CSS custom properties or a theme config';

  const referenceNote = evidence.captureCount > 0
    ? `${evidence.captureCount} reference capture${evidence.captureCount === 1 ? '' : 's'}: ${evidence.captureNames.slice(0, 5).join(', ')}${evidence.captureCount > 5 ? ` (+${evidence.captureCount - 5} more)` : ''}`
    : 'No references captured yet — run `omd ref add` to populate the board';

  return `# Design contract

> This file is the persistent design contract for this project. It is the upstream
> authority for every surface decision. Established by \`omd design\`, maintained by
> the designer. Everything under \`.omd/\` is English; this contract is no exception.

---

## Source of truth

- **Status**: draft
- **Date**: ${now}
- **Surfaces**: ${surfaceSummary}
- **Evidence**: ${referenceNote}
- **Framework**: ${frameworkNote}
- **Tokens**: ${tokenNote}

---

## Brand

- **Personality**: <!-- Open question: what three adjectives describe this brand's character? -->
- **Trust signals**: <!-- Open question: what makes users trust this product? domain expertise, testimonials, price transparency, certifications? -->
- **Avoid**: <!-- Open question: what aesthetics, tones, or references does this brand explicitly reject? -->

---

## Product goals

${frameSummary}

<!-- Open question: what are the top two or three measurable outcomes this product must achieve? -->

---

## Personas & jobs

<!-- Open question: who uses this product and what job are they hiring it to do?
     Format: Persona name — one sentence on who they are and what they need to accomplish. -->

---

## Information architecture

<!-- List the surfaces, their hierarchy, and the primary user path through them.
     Example:
       - / (home) — first impression, conversion
       - /pricing — decision
       - /docs — activation
     Primary path: home → pricing → sign up -->

---

## Design principles

<!-- Two to four product-specific principles that resolve conflicts when two valid choices both work.
     Example: "Clarity beats cleverness — when a UI pattern is clever but unfamiliar, use the familiar one." -->

---

## Visual language

### Color
<!-- Token names and roles. Fill from .omd/attribution.md if present. -->

### Typography
<!-- Type scale, font families, weight ladder. -->

### Spacing
<!-- Spacing ladder. -->

### Radius
<!-- Corner radius ladder. -->

### Motion
${evidence.hasMotionSpec
    ? '<!-- Refer to .omd/motion-spec.md for scene-level detail. Summarise the overall motion vocabulary here. -->'
    : '<!-- Open question: duration range, easing vocabulary, and whether motion is decorative or functional. -->'}

---

## Components

### Reused (already built)
<!-- List components already in the codebase with their location. -->

### New (to be built)
<!-- List components that do not yet exist and must be built. -->

### Variants
<!-- Which components need size/color/state variants? List them. -->

### States
<!-- Which components carry interaction states? Cross-reference Interaction states section below. -->

---

## Accessibility

- **Target**: WCAG 2.2 AA minimum
- **Language**: <!-- primary language, e.g. "ko" for Korean. Determines word-break rules. -->
- **Focus management**: <!-- any non-standard focus routing (modals, skip-nav, single-page navigation)? -->

---

## Responsive behavior

- **Breakpoints**: 375px (base) / 768px / 1280px
- **Mobile-first**: yes — base styles target 375px, larger viewports layer on top
- **Exceptions**: <!-- any surfaces that are desktop-only or have non-standard breakpoints? -->

---

## Interaction states

Every interactive surface must account for all applicable states. Each state is either
implemented or explicitly skipped with a reason recorded in \`omd decision\`.

### Loading
<!-- How does the UI signal that data is in flight? Skeleton, spinner, shimmer, or disabled state?
     Which surfaces show loading: forms (after submit), data lists, async navigation? -->

### Empty
<!-- What does a data list, feed, or result set show when there is nothing to display?
     An empty container is a design defect. Every list needs an empty state. -->

### Error
<!-- How are error conditions surfaced? Form validation errors (field-level + summary),
     network failures, permission errors. Minimum: role=alert on error messages,
     aria-invalid on failed fields, visible error copy that states what to do next. -->

### Success
<!-- How is a completed action confirmed? Inline confirmation, toast, page transition,
     or a dedicated success screen? Duration and dismissal behaviour. -->

### Disabled
<!-- Disabled elements must still communicate why they are disabled. A greyed-out button
     with no tooltip is an accessibility failure. Either remove the element when the
     action is unavailable, or pair the disabled state with explanatory copy. -->

### Offline
<!-- Does this product have any offline capability or offline-detection UI?
     If not, document that it is an explicit non-requirement. -->

---

## Content voice

${evidence.hasVoiceStudy
    ? '<!-- Derived from .omd/voice-study.md. Summarise the register, vocabulary temperature, and sentence rhythm rules here. -->'
    : '<!-- Open question: what register does this product use? Formal/informal, warm/authoritative, Korean 해요체/합니다체. Cite a voice study capture from the reference board. -->'}

---

## Implementation constraints

- **No new dependencies**: except those already declared in package.json
- **Browser targets**: last 2 major versions of Chrome, Firefox, Safari, Edge
- **Performance**: <!-- any specific performance budget? LCP target, bundle size limit? -->
- **Frameworks/libraries already in use**: ${frameworkNote}
- **Additional constraints**: <!-- any deploy environment, CMS, or accessibility certification constraints? -->

---

## Open questions

<!-- Collect unresolved decisions here. Each question should name who can answer it
     and what the consequence of the default assumption is.

     Template:
       - Q: [question]
         Default assumption: [what will be implemented if unanswered]
         Consequence if wrong: [what breaks or must be rebuilt]
         Owner: [designer / product / engineering]
-->
`;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse the h2 section headings present in a design.md document.
 * Returns a map from normalised heading text to the section body content.
 *
 * Normalisation: trimmed, lowercased. Matching against REQUIRED_SECTIONS
 * is done case-insensitively at the call site.
 */
export function parseDesignSections(md: string): Map<string, string> {
  const map = new Map<string, string>();
  // Split on h2 headings; slice(1) drops the preamble before the first ##.
  const chunks = md.split(/^##\s+/m).slice(1);
  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    const heading = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const body = nl === -1 ? '' : chunk.slice(nl + 1);
    if (heading) map.set(heading.toLowerCase(), body);
  }
  return map;
}

/**
 * Find the canonical REQUIRED_SECTIONS entry that matches a parsed heading,
 * or null when no match is found.
 */
function matchSection(heading: string): DesignSection | null {
  const lower = heading.toLowerCase();
  for (const s of REQUIRED_SECTIONS) {
    if (s.toLowerCase() === lower) return s;
  }
  return null;
}

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Validate a design.md document against the required section schema.
 *
 * Two violation codes:
 *
 *   DESIGN-INCOMPLETE   A required section is missing entirely from the document.
 *
 *   DESIGN-INCOMPLETE   The "Interaction states" section exists but does not
 *                       enumerate any of the six required states (loading/empty/
 *                       error/success/disabled/offline). A section that exists but
 *                       leaves all states blank is worse than no section at all —
 *                       it gives a false impression of coverage.
 *
 * Only called when `.omd/design.md` exists (the caller guards that). A bare project
 * without design.md is not nagged.
 */
export function validateDesignMd(md: string): Violation[] {
  const violations: Violation[] = [];
  const sections = parseDesignSections(md);

  // Collect which required sections are present via case-insensitive match.
  const missing: DesignSection[] = [];
  for (const required of REQUIRED_SECTIONS) {
    const found = [...sections.keys()].some((k) => matchSection(k) === required);
    if (!found) missing.push(required);
  }

  for (const section of missing) {
    violations.push({
      id: 'DESIGN-INCOMPLETE',
      severity: 'warn',
      layer: 1,
      category: 'system',
      nodeId: 'page',
      path: 'design',
      value: section,
      message: `design.md is missing the "${section}" section. Run \`omd design\` to refresh the contract, then fill in the open question.`,
    });
  }

  // Interaction states section exists but enumerates no states.
  const interactionBody = [...sections.entries()]
    .find(([k]) => matchSection(k) === 'Interaction states')?.[1] ?? null;

  if (interactionBody !== null) {
    const bodyLower = interactionBody.toLowerCase();
    const enumerated = INTERACTION_STATES.filter((s) => bodyLower.includes(s));
    if (enumerated.length === 0) {
      violations.push({
        id: 'DESIGN-INCOMPLETE',
        severity: 'warn',
        layer: 1,
        category: 'system',
        nodeId: 'page',
        path: 'design',
        value: 'Interaction states: (blank)',
        message:
          'design.md has an "Interaction states" section but it does not enumerate any states '
          + '(loading/empty/error/success/disabled/offline). A section that exists but leaves '
          + 'all states blank gives false coverage assurance. Fill in each state or skip it '
          + 'with a written reason.',
      });
    } else {
      // Partial coverage: states present but some missing.
      const missing2 = INTERACTION_STATES.filter((s) => !bodyLower.includes(s));
      for (const state of missing2) {
        violations.push({
          id: 'DESIGN-INCOMPLETE',
          severity: 'warn',
          layer: 1,
          category: 'system',
          nodeId: 'page',
          path: 'design',
          value: `Interaction states: missing ${state}`,
          message:
            `design.md "Interaction states" section does not mention "${state}". `
            + 'Either implement this state and document it, or explicitly skip it with a reason in `omd decision`.',
        });
      }
    }
  }

  return violations;
}
