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
