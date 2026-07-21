import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const normalize = (text: string): string => text.replace(/\s+/g, ' ');
type Contract = { path: string; text: string };

const contract = (path: string): Contract => ({ path, text: normalize(read(path)) });
const protocol = contract('core/protocol/human-design-loop.md');
const composition = contract('core/protocol/composition-contract.md');
const scout = contract('src/agents/scout.agent.yaml');
const composer = contract('src/agents/composer.agent.yaml');
const eye = contract('src/agents/eye.agent.yaml');
const ultradesign = contract('src/skills/omd-ultradesign/SKILL.md');
const framer = contract('src/agents/framer.agent.yaml');
const hand = contract('src/agents/hand.agent.yaml');

const clause = (source: Contract, start: string, end: string): Contract => {
  const startIndex = source.text.indexOf(start);
  const endIndex = source.text.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `${source.path}: missing clause start ${start}`);
  assert.notEqual(endIndex, -1, `${source.path}: missing clause end ${end}`);
  return { path: source.path, text: source.text.slice(startIndex, endIndex) };
};

const featureProtocol = clause(protocol, 'Reference synthesis starts from function', '## Support-chat conditional regression');
const transferProtocol = clause(composition, '## Reference synthesis', '`omd composition --check` validates this ABI');
const supportProtocol = clause(protocol, 'A support-ticket conversation', '## Task coverage matrix');
const landingProtocol = clause(composition, '## Reference synthesis', '`omd composition --check` validates this ABI');

const assertOrderedFields = (source: Contract, fields: readonly string[], message: string): void => {
  let previous = -1;
  for (const field of fields) {
    const index = source.text.indexOf(field);
    assert.notEqual(index, -1, `${source.path}: missing ${message} field ${field}`);
    assert.ok(index > previous, `${source.path}: ${message} fields must remain in canonical order at ${field}`);
    previous = index;
  }
};
const assertSentence = (source: Contract, pattern: RegExp, message: string): void => {
  const sentences = source.text.split(/[.!?]\s+/);
  assert.ok(sentences.some((sentence) => pattern.test(sentence)), `${source.path}: ${message}`);
};


test('canonical protocol owns feature branch selection and bounded inference', () => {
  assert.match(featureProtocol.text, /Branch A — explicit functions/);
  assert.match(featureProtocol.text, /Branch B — product goal only/);
  assert.match(featureProtocol.text, /Explicit details always win/);
  assert.match(featureProtocol.text, /smallest task-complete feature set/);
  assert.match(featureProtocol.text, /task-completion dependency/);
  assert.match(featureProtocol.text, /may not add optional analytics, AI, collaboration, personalization, admin, export, or adjacent capability/);
  assert.match(featureProtocol.text, /Pure `marketing`, `editorial`, and static work does not infer CRUD, state machinery, probes, or task evidence/);
  assert.match(featureProtocol.text, /transfers only explicit applicable content or interaction primitives/);
});

test('canonical protocol defines the complete sanitized primitive transfer record once', () => {
  assertOrderedFields(
    transferProtocol,
    [
      '### Feature:',
      '- Origin:',
      '- Assumption:',
      '- Primitive:',
      '- Source ref:',
      '- Trust:',
      '- Uncertainty:',
      '- Structural rule:',
      '- Adaptation:',
      '- Token variation:',
      '- Conflict resolution:',
      '- Destination route:',
      '- Destination selector:',
      '- Mobile behavior:',
      '#### Axes',
    ],
    'transfer record',
  );

  for (const axis of [
    'information architecture/navigation',
    'macro layout and panel/region geometry',
    'content density',
    'typography/hierarchy',
    'spacing/rhythm',
    'component anatomy',
    'interaction/state/feedback',
    'responsive/mobile recomposition',
    'motion/transition',
  ]) {
    assert.ok(transferProtocol.text.includes(axis), `protocol: missing reference axis ${axis}`);
  }

  assert.match(transferProtocol.text, /Applicable axes require a substantive observed rule and adaptation or decline rationale/);
  assert.match(transferProtocol.text, /`N\/A` uses `N\/A` as its observed rule and a substantive reason/);
  assert.match(transferProtocol.text, /accept or adapt at least one structural or visual-system axis/);
  assert.match(transferProtocol.text, /structurally validated[\s\S]*closed Markdown ABI/i);
  assert.match(transferProtocol.text, /Destination selectors must be unique[\s\S]*stable `\[data-\*=/);
});

test('roles retain bounded, distinct reference responsibilities while using the canonical protocol', () => {
  assertSentence(scout, /select(?:s)?[^.]{0,80}(?:canonical )?(?:feature )?branch/i, 'scout must select the feature branch before research');
  assertSentence(scout, /(?:each|every) applicable axis[^.]{0,120}(?:observed rule|record)/i, 'scout must record per-axis observations');
  assertSentence(scout, /N\/A[^.]{0,80}reason|reason[^.]{0,80}N\/A/i, 'scout must record why an axis is inapplicable');

  assertSentence(composer, /(?:preserve|carry forward)[^.]{0,100}(?:feature|source|transfer)/i, 'composer must preserve supplied transfer identity');
  assertSentence(composer, /(?:adaptation|adapt)[^.]{0,100}(?:destination|composition)/i, 'composer must adapt transferred rules to the destination contract');
  assertSentence(composer, /(?:accepted )?layout[^.]{0,100}(?:destination )?composition contract/i, 'composer must land accepted layout in composition');

  assert.match(eye.text, /assess only applicable axes/i);
  assert.match(eye.text, /visible or probe-supported/i);
  assert.match(eye.text, /Fail interaction-only or token-only synthesis when applicable layout or visual-system axes are missing/i);
  assert.match(eye.text, /Make no interaction claim without matching probe evidence/i);
  assert.match(eye.text, /reasoned `N\/A`/i);
});

test('reference transfer keeps clean-room identity and task authority separate', () => {
  assert.match(protocol.text, /Synthesis records never issue `T#`, create probes, alter task coverage, or redefine task\/final-evidence contracts/);
  assert.match(protocol.text, /stable source keys\/labels, trust, uncertainty, and sanitized rules—not URLs, screenshots, pixels, or source-page descriptions/);
  assert.match(scout.text, /Never pass raw URLs, screenshots, pixels, or source-page descriptions to composer, hand, or eye/);
  assert.match(composer.text, /not raw URLs, screenshots, pixels, or source-page descriptions/);
  assert.match(eye.text, /never source identity, rationale, URLs, screenshots, pixels, or source descriptions/);
  assert.match(ultradesign.text, /never raw URLs, screenshots, pixels, or source-page descriptions/);

  assert.match(landingProtocol.text, /Destination selector:/);
  assert.match(landingProtocol.text, /Destination selectors must be unique/);
  assert.match(composer.text, /never creates or replaces a frame `T#` task locator/);
});

test('eye rejects inferred non-product primitives and requires reasoned applicability', () => {
  assert.match(eye.text, /Fail any `origin: inferred` content or interaction primitive on `marketing`, `editorial`, or static work/);
  assert.match(eye.text, /allow inferred content or interaction primitives only on the `product` portion/);
  assert.match(eye.text, /Every applicable accepted\/adapted axis must also be visible or probe-supported/);
  assert.match(eye.text, /every decline is explicit and justified by product task, accessibility\/mobile constraints, or system coherence/);
  assert.match(eye.text, /reasoned `N\/A`/);
});

test('canonical support-ticket rule remains conditional and proves grouping plus visible final reply', () => {
  assert.match(supportProtocol.text, /conditional primitive regression, never a default grammar/);
  assert.match(supportProtocol.text, /When explicitly requested or task-completely inferred/);
  assert.match(supportProtocol.text, /machine-readable timestamps/);
  assert.match(supportProtocol.text, /declared temporal compatibility window/);
  assert.match(supportProtocol.text, /merges consecutive same-sender messages within that window/);
  assert.match(supportProtocol.text, /splits an expired-window reply into a new group with fresh sender\/time metadata/);
  assert.match(supportProtocol.text, /Production probes\/tests prove both temporal boundaries/);
  assert.match(supportProtocol.text, /same-sender reply within the declared window merges without a duplicate sender\/time group/);
  assert.match(supportProtocol.text, /expired-window same-sender reply splits into a new group with fresh metadata/);
  assert.match(supportProtocol.text, /new bubble must be visibly revealed in the desktop and mobile conversation viewport/);
  assert.match(supportProtocol.text, /toast or offscreen DOM text alone fails/);
  assert.match(supportProtocol.text, /Require immediate repeated-send regression and visible-last-bubble evidence/);
  assert.match(supportProtocol.text, /Do not apply these conversation traits to non-conversation, marketing, editorial, or static surfaces/);

  assert.match(eye.text, /Run this checklist only when a transfer is admissible/);
  assert.match(eye.text, /consecutive same-sender sends must remain one temporal group/i);
  assert.match(eye.text, /committed last bubble is only a toast or offscreen DOM text instead of visibly revealed in the desktop and mobile conversation viewport/);
  assert.match(eye.text, /Do not apply this checklist to non-conversation, marketing, editorial, or static surfaces/);
});
test('list-detail prompt contract is conditional and proves non-primary object-local selection', () => {
  const taskMatrix = clause(protocol, '## Task coverage matrix', '## UX task coverage');

  assert.match(taskMatrix.text, /requested or task-completely inferred list→detail workspace with two or more work objects/);
  assert.match(taskMatrix.text, /production `T#`/);
  assert.match(taskMatrix.text, /non-default, non-first object/);
  assert.match(taskMatrix.text, /detail's identity and object-local state/);
  assert.match(taskMatrix.text, /bound production locator\/probe exercises that same non-primary selection/);

  assert.match(framer.text, /requested or task-completely inferred list→detail workspace with two or more work objects/);
  assert.match(framer.text, /production `T#`/);
  assert.match(framer.text, /non-default, non-first (?:item|object)/);
  assert.match(framer.text, /selected detail identity and object-local state/);
  assert.match(hand.text, /selection keyed by work-object item id, not a fixed fixture or list position/);
  assert.match(hand.text, /bound production locator\/probe must select the required non-primary item/);

  for (const source of [taskMatrix, framer, hand]) {
    assert.match(source.text, /conditional|applicable|workspace shape/i);
    assert.match(source.text, /(?:does not impose|do not add)[^.]{0,120}(?:other product|non-list-detail|marketing, editorial, or static)/i);
    assert.doesNotMatch(source.text, /#4821/);
  }
});
test('role conditionals independently gate list-detail and support-ticket evidence', () => {
  for (const source of [scout, composer, eye]) {
    const listStart = source.text.indexOf('Only for an applicable list-detail workspace');
    const supportStart = source.text.indexOf('Separately, only for an applicable support-ticket conversation');
    assert.ok(listStart >= 0 && supportStart > listStart, `${source.path}: independent conditional order`);
    const listRule = source.text.slice(listStart, supportStart);
    assert.match(listRule, /non-primary-object identity and object-local-state evidence boundary/i);
    assert.doesNotMatch(listRule, /temporal-window|last bubble|same-sender/i);
  }

  assert.match(scout.text, /support-ticket conversation[^.]{0,100}temporal-window evidence boundary/i);
  assert.match(composer.text, /support-ticket conversation[^.]{0,100}temporal-window evidence boundary/i);
  assert.match(eye.text, /support-ticket conversation[^.]{0,100}temporal-window evidence boundary[\s\S]*last bubble/i);
  for (const source of [scout, composer, eye]) {
    assert.match(source.text, /general multi-axis transfer review remains required for every admissible product transfer|required for every admissible non-chat product transfer/i);
  }
});

test('ultradesign routes and gates reference work without duplicating the canonical transfer catalogue', () => {
  assert.match(ultradesign.text, /Figma structural-bypass route[\s\S]*use `omd-figma` for supplied[\s\S]*structure/);
  assert.match(ultradesign.text, /Run `omd doctor`\. Stop on a failed prerequisite/);
  assert.match(ultradesign.text, /Read `protocol\/human-design-loop\.md` from `omd pack dir` first/);
  assert.match(ultradesign.text, /Spawn `omd-scout` with the concept, explicit functions or product goal, surface classification, user references first/);
  assert.match(ultradesign.text, /Require the canonical branch decision before research/);
  assert.match(ultradesign.text, /Only `concept`, `structure`, or `both` opt into a human pause/);
});

test('canonical protocol requires design-gallery visual references and multi-concept exploration', () => {
  const gallery = clause(protocol, '## Visual reference gallery and concept exploration', '## Support-chat conditional regression');
  assert.match(gallery.text, /first-class research obligation/);
  assert.match(gallery.text, /Pinterest/);
  assert.match(gallery.text, /Dribbble/);
  assert.match(gallery.text, /Mobbin/);
  assert.match(gallery.text, /enumerates multiple distinct main-screen visual directions/);
  assert.match(gallery.text, /blind-selects the strongest direction/);
  assert.match(gallery.text, /Copying a reference is allowed: the hand builds against the local capture with image-to-code fidelity/);
  assert.match(gallery.text, /direction signal only/);
  assert.match(gallery.text, /never replaces the structural sketch divergence/);
  assert.match(gallery.text, /fails the visual acceptance gate even when every task succeeds/);
});

test('scout and skill wire design-gallery visual references as a first-class category', () => {
  assert.match(scout.text, /curated design-gallery visual references/);
  assert.match(scout.text, /Pinterest, Dribbble, Mobbin, Behance, Land-book/);
  assert.match(scout.text, /copying it is allowed with attribution/i);
  assert.match(ultradesign.text, /Explore several distinct candidate concept directions/);
  assert.match(ultradesign.text, /Visual reference gallery and concept exploration/);
  assert.match(ultradesign.text, /a generic default visual\s+system[^.]*fails the visual acceptance gate/);
});
