import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';

const skill = readFileSync(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url), 'utf8');
const protocol = readFileSync(new URL('../core/protocol/human-design-loop.md', import.meta.url), 'utf8');
const imagegen = readFileSync(new URL('../core/theory/imagegen.md', import.meta.url), 'utf8');

test('coordinator receives existing concept policy before deciding the adaptive route', () => {
  const read = skill.indexOf('Before selecting methods, read `omd pack protocol/human-design-loop.md --section "Visual reference gallery and concept exploration"`');
  const classify = skill.indexOf('omd route classify --input');
  assert.ok(read >= 0 && read < classify);
  assert.match(skill, /A simple task is not settled visual evidence; a current supplied direction can be/);
  assert.match(skill, /Experiments stay conditional/);
});

test('the pre-route native contract owns short-request quality instead of requiring a padded user prompt', () => {
  const start = protocol.indexOf('## Visual reference gallery and concept exploration');
  const end = protocol.indexOf('\n## ', start + 3);
  const delivered = protocol.slice(start, end);
  assert.match(delivered, /\[short-request-quality-default\]/);
  assert.match(delivered, /The user need not request references, typography,/);
  assert.match(delivered, /high-craft evidence by default and starts at least `confident`/);
  assert.match(delivered, /even when the user never says "animation"/);
  assert.match(delivered, /not an automatic scene quota/);
  assert.match(delivered, /same-language references can establish line density and wrapping without a cultural-fit claim/);
});

test('available native image generation precedes coded concept studies without replacing implementation proof', () => {
  assert.match(skill, /Check native image generation first/);
  assert.match(skill, /unsettled marketing, use it when available/);
  assert.match(protocol, /any host with that capability uses image-first concept studies by default/);
  assert.match(imagegen, /A one-sentence landing request does not need to ask for images/);
  assert.match(imagegen, /Native image generation is not an external design harness/);
  assert.match(imagegen, /generate provisional images in parallel with those owners/);
  assert.match(imagegen, /Use this source helper for an observed image-capability fallback/);
  assert.match(imagegen, /mockup itself\s+never becomes a page-sized image/);
  assert.match(imagegen, /final blind Eyes receive only anonymous production renders/);
});

test('route input differentiates unresolved visuals from an existing direction without requiring universal studies', () => {
  const help = inputSkeleton('route-input').constraints?.join(' ') ?? '';
  assert.match(help, /Before choosing or skipping visual methods/);
  assert.match(help, /existing visible evidence that settles the content-to-form relationship/);
  assert.match(help, /Functional simplicity, quietness, no metaphor, no shipped bitmap, or future review alone do not settle it/);
  assert.match(help, /A bounded change to a current visual target may skip experiments/);
  assert.match(help, /do not reopen that target or impose a candidate quota/);
});

test('overall visual rejection reopens generation rather than anchoring edits to the rejected draft', () => {
  const start = imagegen.indexOf('## Reopen a rejected visual direction');
  const end = imagegen.indexOf('\n## ', start + 3);
  const rejection = imagegen.slice(start, end).replace(/\s+/g, ' ');
  assert.match(skill, /On visual rejection, reread `omd pack theory\/imagegen.md --section "Reopen a rejected visual direction"`/);
  assert.match(protocol, /The latter\s+reopens unaccepted choices and generation conditioning/);
  assert.match(rejection, /A broad rejection of decoration, typography or the overall look/);
  assert.match(rejection, /Generate fresh independent concepts, not image edits anchored to the rejected draft/);
  assert.match(rejection, /Omit rejected images from positive reference-image inputs and recent-image inclusion/);
  assert.match(rejection, /A relative favourite among unresolved candidates is not an accepted direction/);
});

test('a local correction does not discard an accepted target or become a blanket style ban', () => {
  const rejection = imagegen.replace(/\s+/g, ' ');
  assert.match(rejection, /A bounded correction to an accepted direction preserves its unaffected target relationships and may edit that image/);
  assert.match(rejection, /Retain an image seed only for an explicitly accepted target or a genuinely bounded edit/);
  assert.match(rejection, /It is not an instruction to become quiet, use thinner type, remove all imagery/);
  assert.match(rejection, /No universal style ban, candidate quota, new score, or claim of human provenance/);
});

test('visual rejection retains factual evidence but does not promote an example treatment to a brand lock', () => {
  const rejection = imagegen.replace(/\s+/g, ' ');
  const scout = readFileSync(new URL('../src/agents/scout.agent.yaml', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const reference = readFileSync(new URL('../core/protocol/reference-assembly.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(rejection, /Keep supported facts, useful task references and explicit invariants/);
  assert.match(rejection, /An observed example page's tokens are not immutable brand law/);
  assert.match(reference, /Established identity still cannot be outvoted by category defaults/);
  assert.match(scout, /retain useful task captures and repair the named craft evidence gap/);
  assert.match(scout, /A gallery directory or unsupported saved principle cannot stand in for a live typography\/composition study/);
  assert.match(rejection, /Real-font proof remains necessary; generated lettering cannot settle it/);
});

test('reference acquisition and visible transfer are inspected before another rejected-direction draft', () => {
  const reference = readFileSync(new URL('../core/protocol/reference-assembly.md', import.meta.url), 'utf8');
  assert.match(imagegen, /Before generating again after repeated rejection, complete the acquisition and transfer inspection/);
  assert.match(reference, /omd ref verify --json/);
  assert.match(reference, /omd ref verify <page> --candidate <id> --json/);
  assert.match(reference, /Content-only evidence never pads visual coverage/);
  assert.match(reference, /not perceptual percentages, authorship judgments or beauty scores/);
  assert.match(reference, /source-aware fidelity check/);
});

test('preproduction Eye can inspect assigned renders without weakening isolated production review', () => {
  const eye = readFileSync(new URL('../src/agents/eye.agent.yaml', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(eye, /\[preproduction-render-review-scope\]/);
  assert.match(eye, /provisional study audit, concept perspective, structural selection, or typography-proof review is not an isolated final production review/);
  assert.match(eye, /inspect only the explicitly supplied first-party study, candidate, or specimen render paths with the native image viewer/);
  assert.match(eye, /Missing or unreadable images remain unassessed/);
  assert.match(eye, /do not claim host-enforced isolation, final production approval, final-v2 evidence, or completion/);
  assert.match(eye, /final and refinement reviews still require their host-issued one-use evidence tool and bound output contract, never a path-only fallback/);
  assert.match(eye, /Copy-editor mode remains text-only/);
  assert.match(eye, /\[initial-final-render-isolated-exception\][\s\S]*read_reviewer_evidence[\s\S]*adaptive-final-render-reviewer-handback-v1/);
  assert.match(eye, /\[rendered-refinement-isolated-exception\][\s\S]*read_reviewer_evidence[\s\S]*adaptive-refinement-reviewer-handback-v1/);
  assert.match(protocol, /a provisional review or path-only handoff cannot replace them/);
});

// These are delivery/wording regressions, not a semantic skip verifier or evidence of better design.
// The matched native runs and actual renders own those behavioral and visual claims.
