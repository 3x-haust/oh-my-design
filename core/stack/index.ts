import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { discoverEvidence } from '../design/index.ts';

/**
 * Deterministic stack routing. The agents repeatedly misread a folder — treating a truly blank
 * greenfield, or their own leftover `index.html`, as "an existing vanilla-HTML project" and dropping
 * to plain HTML. This computes the stack from folder evidence so the model does not have to judge it:
 * the tool measures, the model builds exactly what it names. The only lawful override to plain HTML on
 * a greenfield is a verbatim explicit user request, recorded via `omd decision`.
 */
export interface StackDecision {
  stack: 'react-vite-typescript' | 'existing' | 'plain-html-css-js';
  framework: string | null;
  greenfield: boolean;
  /** Whether a plain-HTML choice is even permitted here (only on a blank greenfield, with an explicit request). */
  htmlOverrideAllowed: boolean;
  reason: string;
}

export function computeStack(cwd: string): StackDecision {
  const ev = discoverEvidence(cwd);

  if (ev.hasPackageJson && ev.framework) {
    return {
      stack: 'existing',
      framework: ev.framework,
      greenfield: false,
      htmlOverrideAllowed: false,
      reason: `existing ${ev.framework} project (package.json) — build in it and add no unnecessary dependencies`,
    };
  }

  if (ev.hasPackageJson || ev.appEvidencePaths.length > 0) {
    const marker = ev.hasPackageJson ? 'package.json' : ev.appEvidencePaths[0]!;
    return {
      stack: 'existing',
      framework: ev.framework,
      greenfield: false,
      htmlOverrideAllowed: false,
      reason: `existing toolchain (${marker}) — preserve and investigate it, never cover it with a React scaffold`,
    };
  }

  return {
    stack: 'react-vite-typescript',
    framework: null,
    greenfield: true,
    htmlOverrideAllowed: true,
    reason:
      'truly blank greenfield (no package.json, no build config) — default to React + Vite + TypeScript. '
      + 'A loose leftover index.html/.css/.js is NOT an existing stack, and one static page is no reason to drop '
      + 'to plain HTML. Emit plain HTML/CSS/JS only on a verbatim explicit user request, recorded via omd decision.',
  };
}

/**
 * Post-build conformance check. `computeStack` decides the stack from folder evidence, but nothing
 * verified that the hand actually built what it decided — so a blank greenfield could resolve to
 * React + Vite + TypeScript and still ship as plain HTML/CSS/JS, undetected, because a rendered
 * HTML page and a rendered React page look identical to `omd check`. This closes that gap: it reads
 * what materialised on disk and fails when a greenfield shipped as plain HTML without the one lawful
 * override — a verbatim explicit user request for HTML, recorded via `omd decision`.
 */
export interface StackConformance {
  readonly ok: boolean;
  readonly actual: 'react-or-existing' | 'plain-html' | 'none';
  readonly reason: string;
}

/** True when the shipped output is a plain HTML page with no package manifest or build config. */
function shippedPlainHtml(cwd: string, surfacePaths: readonly string[]): boolean {
  if (existsSync(join(cwd, 'index.html'))) return true;
  if (surfacePaths.some((p) => p.endsWith('.html'))) return true;
  try {
    return readdirSync(cwd).some((f) => f.endsWith('.html'));
  } catch {
    return false;
  }
}

/**
 * A plain-HTML greenfield is lawful only when the user's verbatim request for HTML was recorded via
 * `omd decision`. We require the decisions log to mention HTML alongside a quotation mark — the
 * verbatim quote the routing rule demands. A silent drift to HTML records no such decision and fails.
 */
function htmlAuthorisedByUser(decisionsMd: string | null): boolean {
  if (!decisionsMd) return false;
  const text = decisionsMd.toLowerCase();
  const mentionsHtml = /\bhtml\b/.test(text) || /플레인|바닐라|정적\s*html/.test(text);
  const hasQuote = /["'“”„‟「」『』]/.test(decisionsMd);
  return mentionsHtml && hasQuote;
}

export function verifyStack(cwd: string): StackConformance {
  const ev = discoverEvidence(cwd);

  // A materialised manifest or build config means the React scaffold (or an existing toolchain the
  // user brought) is on disk — the greenfield default resolved correctly.
  if (ev.hasPackageJson || ev.appEvidencePaths.length > 0) {
    return {
      ok: true,
      actual: 'react-or-existing',
      reason: `package.json / build config present (${ev.framework ?? 'toolchain'}) — the computed stack materialised`,
    };
  }

  if (!shippedPlainHtml(cwd, ev.surfacePaths)) {
    return { ok: true, actual: 'none', reason: 'no shipped surface and no manifest yet — nothing to verify' };
  }

  if (htmlAuthorisedByUser(ev.decisionsMd)) {
    return { ok: true, actual: 'plain-html', reason: 'plain HTML authorised by a recorded verbatim user request' };
  }

  return {
    ok: false,
    actual: 'plain-html',
    reason:
      'shipped as plain HTML/CSS/JS with no package.json and no recorded verbatim user request for HTML. '
      + 'A blank greenfield resolves to React + Vite + TypeScript (see `omd stack`); dropping to plain HTML '
      + 'without the user asking for it in so many words is a stack-routing defect. Scaffold React + Vite + '
      + 'TypeScript, or, only if the user actually asked for HTML, record their exact words via `omd decision`.',
  };
}
