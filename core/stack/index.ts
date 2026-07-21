import { discoverEvidence } from '../design/index.ts';

/**
 * Deterministic stack routing. The default is plain HTML/CSS/JS: a landing, marketing, or content
 * surface is a static page and needs no framework. A framework (React + Vite + TypeScript, or
 * whatever an existing project already uses) is chosen only when the user explicitly asks for one or
 * the surface is a genuinely stateful application — and an existing project is always built in as-is.
 * The tool measures the folder; the model builds what fits and defaults to HTML when nothing forces a
 * framework.
 */
export interface StackDecision {
  stack: 'existing' | 'plain-html-css-js';
  framework: string | null;
  greenfield: boolean;
  reason: string;
}

export function computeStack(cwd: string): StackDecision {
  const ev = discoverEvidence(cwd);

  if (ev.hasPackageJson && ev.framework) {
    return {
      stack: 'existing',
      framework: ev.framework,
      greenfield: false,
      reason: `existing ${ev.framework} project (package.json) — build in it and add no unnecessary dependencies`,
    };
  }

  if (ev.hasPackageJson || ev.appEvidencePaths.length > 0) {
    const marker = ev.hasPackageJson ? 'package.json' : ev.appEvidencePaths[0]!;
    return {
      stack: 'existing',
      framework: ev.framework,
      greenfield: false,
      reason: `existing toolchain (${marker}) — preserve and investigate it, never replace it with a different stack`,
    };
  }

  return {
    stack: 'plain-html-css-js',
    framework: null,
    greenfield: true,
    reason:
      'blank greenfield (no package.json, no build config) — default to plain HTML/CSS/JS. '
      + 'Reach for a framework (React + Vite + TypeScript, or another) only when the user explicitly '
      + 'asks for one or the surface is a genuinely stateful application (dashboard, console, CRUD, '
      + 'editor); a static landing or content page needs no framework.',
  };
}
