import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

test('durable protocol, coordinator, and hand share the same stack precedence', () => {
  const sources = [
    read('core/protocol/human-design-loop.md'),
    read('src/skills/omd-ultradesign/SKILL.md'),
    read('src/agents/hand.agent.yaml'),
  ];
  for (const source of sources) {
    const contract = source.replace(/\s+/g, ' ');
    assert.match(contract, /plain HTML\/CSS\/JS/);
    assert.match(contract, /only when the user explicitly asks for one or the surface is a genuinely stateful application/i);
    assert.match(contract, /build in an existing (?:project's|repository's) stack/i);
    assert.match(contract, /never pins the stack/i);
    // the React-forcing default was removed
    assert.doesNotMatch(contract, /React \+ Vite \+ TypeScript only for a truly blank greenfield/);
    assert.doesNotMatch(contract, /Plain HTML greenfield requires an explicit user request/i);
  }
});

test('hand records stack evidence before first write and preserves existing surfaces', () => {
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /Before the first write, run `omd stack`/);
  assert.match(hand, /Record the stack choice and concrete evidence with `omd decision`/);
  assert.match(hand, /Always build in an existing project's stack instead of replacing it/);
  assert.match(hand, /a static page and needs no framework/);
});

test('copy is an isolated writer-editor boundary before sketches', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const writer = read('src/agents/writer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  assert.ok(skill.indexOf('Spawn `omd-writer`') < skill.indexOf('omd-sketch'));
  assert.match(skill, /omd copy --check[\s\S]*fresh `omd-eye` in copy-editor mode[\s\S]*writer[\s\S]*omd copy --check/);
  assert.match(skill, /coordinator does not author copy/i);
  assert.match(writer, /only `.omd\/copy-deck\.md`/);
  assert.match(writer, /Never edit UI, code, components, styles, layout/);
  assert.match(eye, /copy-editor mode[\s\S]*Do not receive or inspect renders, code, layout, build\s+rationale/);
});

test('copy fact policy uses explicit IDs and never semantic AI detection', () => {
  const protocol = read('core/protocol/copy-deck.md');
  const writer = read('src/agents/writer.agent.yaml');
  for (const source of [protocol, writer]) {
    const contract = source.replace(/\s+/g, ' ');
    assert.match(contract, /verified\|fixture\|open|`verified`.*`fixture`.*`open`/);
    assert.match(contract, /fixture.*never ship/i);
    assert.match(contract, /open.*(?:cannot|never) support|open facts never support/i);
  }
  assert.match(protocol, /never judges AI-ness[\s\S]*sentence variance[\s\S]*perplexity/i);
  for (const field of ['Audience', 'Language', 'Register', 'Main message', 'Supporting fact', 'Next action', 'Claim refs']) {
    assert.match(protocol, new RegExp(field));
  }
  assert.match(protocol, /every page or surface[\s\S]*H3 block[\s\S]*exactly one/i);
});

test('UX acceptance and probe applicability do not fabricate recovery states', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const hand = read('src/agents/hand.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  for (const source of [protocol, skill, hand, eye]) {
    const contract = source.replace(/\s+/g, ' ');
    for (const phrase of ['primary task', 'frequent action', 'costliest', 'reachable state', 'visible feedback', 'mobile reach']) {
      assert.match(contract, new RegExp(phrase, 'i'));
    }
  }
  for (const source of [protocol, skill, hand]) {
    assert.match(source, /stateful[\s\S]*primary\.json[\s\S]*recovery\.json[\s\S]*navigation-only[\s\S]*primary probe[\s\S]*static[\s\S]*N\/A/i);
  }
  const handContract = hand.replace(/\s+/g, ' ');
  for (const phrase of ['native semantics', 'Preserve entered form values on error', 'block duplicate submission', 'reduced motion']) {
    assert.match(handContract, new RegExp(phrase, 'i'));
  }
  assert.match(eye, /no\s+interaction claim without matching probe evidence/i);
  assert.match(protocol, /Never add fake error, empty, or\s+recovery UI/);
  assert.doesNotMatch(protocol, /navigation-only requires[^.]*recovery\.json/i);
  assert.doesNotMatch(protocol, /static requires[^.]*probe/i);
});

test('Claude plugin reference rewriting knows writer and composer', () => {
  const claude = read('adapters/claude.ts');
  assert.match(claude, /AGENT_REF[^\n]*writer/);
  assert.match(claude, /AGENT_REF[^\n]*composer/);
});

test('composition is fresh, isolated, and shared before structural divergence', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const composer = read('src/agents/composer.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');

  assert.ok(skill.indexOf('Spawn a fresh `omd-composer`') < skill.indexOf('omd-sketch'));
  for (const source of [protocol, skill, composer, hand]) {
    assert.match(source, /omd composition --check/);
  }
  assert.match(composer, /owns? only `.omd\/composition\.md`|write only `.omd\/composition\.md`/i);
  assert.match(composer, /raw screenshots[\s\S]*URLs[\s\S]*candidate renders/i);
  assert.match(sketch, /approved typography and\s+composition contracts[\s\S]*one axis assigned/i);
  assert.match(eye, /task\/CTA clarity[\s\S]*accessibility\/implementation cost/i);
  assert.match(hand, /Frame, copy-deck, type-proof,[\s\S]*changes invalidate/i);
});
test('reference synthesis ABI has one owner and roles route sanitized multi-axis records', () => {
  const composition = read('core/protocol/composition-contract.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const scout = read('src/agents/scout.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(composition, /^## Reference synthesis$/m);
  assert.match(composition, /structurally\s+validated[\s\S]*closed\s+Markdown\s+ABI/i);
  assert.match(composition, /Use every axis exactly once[\s\S]*Disposition is\s+exactly/i);
  for (const source of [scout, composer, eye, skill]) {
    assert.match(source, /protocol\/composition-contract\.md/);
  }
  assert.match(scout, /Never pass raw URLs, screenshots, pixels/i);
  assert.match(composer, /raw screenshots[\s\S]*pixels[\s\S]*reference URLs/i);
  assert.match(eye, /never source identity, rationale, URLs, screenshots, pixels, or source descriptions/i);
  assert.match(skill, /raw URLs, screenshots, pixels/i);
  assert.match(scout, /emit one sanitized[\s\S]*strict `## Reference synthesis`[\s\S]*exact axis keys[\s\S]*dispositions[\s\S]*reasons/i);
  assert.match(scout, /do not rename, omit, duplicate, or locally redefine/i);
  assert.match(composer, /Serialize[\s\S]*strict `## Reference synthesis` Markdown ABI[\s\S]*do not define, reinterpret, or supplement a parallel schema/i);
  assert.match(composer, /without omissions or duplicates/i);
  assert.match(eye, /failed `omd composition --check`[\s\S]*missing or duplicate canonical axis or destination selector[\s\S]*blocker/i);
  assert.match(eye, /clean validator result does not replace[\s\S]*visual and[\s\S]*probe-supported correspondence/i);
  assert.match(skill, /composition protocol alone[\s\S]*strict `## Reference synthesis` Markdown ABI[\s\S]*no duplicate schema, heading, axis, or selector/i);
  assert.match(loop, /list→detail workspace[\s\S]*non-default, non-first object[\s\S]*object-local state/i);
  assert.match(loop, /declared temporal compatibility window[\s\S]*within that window[\s\S]*expired-window reply/i);
});

test('references are composed section by section from parts across references, never traced whole', () => {
  const assembly = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  const composition = read('core/protocol/composition-contract.md').replace(/\s+/g, ' ');
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  for (const source of [assembly, composition, scout]) {
    // The page is composed from parts, each section assigned its own best-fit reference part.
    assert.match(source, /composed from parts|composition of parts|compose the page from parts/i);
    // Tracing one whole reference wholesale is a derivative failure, not fidelity.
    assert.match(source, /tracing one reference's (entire|whole) page layout and section order wholesale is a derivative failure, not fidelity/i);
  }
  // Different sections may draw from different references.
  assert.match(assembly, /Different sections may draw parts from different references/i);
  assert.match(composition, /different sections may draw from different references/i);
});
test('the transfer boundary permits per-section layout fidelity and forbids only whole-page identity', () => {
  const composition = read('core/protocol/composition-contract.md').replace(/\s+/g, ' ');
  // Faithfully rebuilding an assigned section's layout is permitted and expected.
  assert.match(composition, /an assigned reference part's layout, composition, and treatment, rebuilt\s+faithfully/i);
  assert.match(composition, /reproducing the assigned section's layout is expected/i);
  assert.match(composition, /Faithfully rebuilding one assigned section is lawful/i);
  // What is forbidden is the source's identity and its whole-page gestalt, not a single section.
  assert.match(composition, /Forbidden\s+transfer is the source's identity and its whole-page gestalt/i);
  assert.match(composition, /across the entire page[\s\S]*full section order and overall silhouette/i);
  assert.match(composition, /tracing a whole reference page section-by-section into your whole page is the derivative failure/i);
});
test('roles keep composer downstream of the chosen draft without image-generation duties', () => {
  const scout = read('src/agents/scout.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  const normalizedScout = scout.replace(/\s+/g, ' ');
  const normalizedComposer = composer.replace(/\s+/g, ' ');
  const normalizedEye = eye.replace(/\s+/g, ' ');

  assert.match(normalizedScout, /source screenshot is saved under `\.omd\/refs\/`, where the hand reads it for image-to-code fidelity/i);
  assert.match(normalizedScout, /skin-abstracted blueprint, or the reference capture itself\. Make the draft lineage explicit/i);
  assert.match(normalizedComposer, /does not generate images, manage a draft cache, select a draft, or record a decision\./i);
  assert.match(normalizedComposer, /analyzes and translates the chosen draft into[\s\S]*consuming it solely as art-direction input/i);
  assert.doesNotMatch(normalizedComposer, /omd ref add .+--shot|\.omd\/\.cache\/imagegen|record the paths and the pick/i);
  assert.match(normalizedEye, /protocol\/composition-contract\.md.*authoritative/i);
  assert.match(normalizedEye, /both task performance and visual composition across desktop and mobile/i);
});

test('focal hierarchy, carrier, four-proof sketches, and selector floor share one contract', () => {
  const composition = read('core/protocol/composition-contract.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const composer = read('src/agents/composer.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');

  assert.match(composition, /^## Focal hierarchy$/m);
  for (const source of [composition, composer, skill, hand]) {
    assert.match(source, /dominant anchor[\s\S]*visual-mass\s+budget[\s\S]*value\/proof\/CTA/i);
    assert.match(source, /photo is never mandatory|never mandate a photo|never a\s+mandatory photo|Do not mandate a photo/i);
    assert.doesNotMatch(source, /(?:photo|photograph) (?:is|required|must be) (?:mandatory|required)/i);
  }
  for (const source of [composition, loop, composer, skill, sketch, eye, hand]) {
    assert.match(source, /visible(?: primary)? CTA[\s\S]*predictable (?:completion path|path to completion)|visible CTA (?:plus|and|with)(?: a)? predictable\s+(?:completion path|path to completion)/i);
    assert.match(source, /terminal form|full form|form\/control surface/i);
  }
  for (const source of [composition, composer, skill]) {
    assert.match(source, /(?:alternate|explicit) non-media mental-model carrier[\s\S]*limitation/i);
    assert.match(source, /none because\s+no approved photo/i);
  }

  assert.match(sketch, /four structural proofs[\s\S]*1280x900[\s\S]*390x844[\s\S]*full-page desktop[\s\S]*full-page mobile/i);
  assert.match(sketch, /Full-page captures[\s\S]*only for narrative dependency and composition rhythm/i);
  assert.match(skill, /Every candidate renders exactly four proofs[\s\S]*--full-page/i);

  for (const source of [loop, skill, eye]) {
    assert.match(source, /0\s+(?:=\s*)?absent\/broken[\s\S]*1\s+(?:=\s*)?weak[\s\S]*2\s+(?:=\s*)?adequate[\s\S]*3\s+(?:=\s*)?strong[\s\S]*4\s+(?:=\s*)?exceptional/i);
    assert.match(source, /eight integer(?:s| scores)[\s\S]*eight one-sentence[\s\S]*arithmetic mean/i);
    assert.match(source, /(?:(?:dimension\s+below 2|below 2\s+on any dimension)[\s\S]*(?:reject|rejects)|reject[\s\S]*dimension\s+below 2)/i);
    assert.match(source, /Scores? 1 (?:and|or) 3[^\n]*interpolat/i);
    assert.match(source, /Task\/CTA clarity[\s\S]*0: no immediate primary CTA[\s\S]*4: an immediate primary CTA, predictable\s+completion path/i);
    assert.match(source, /Narrative dependency[\s\S]*0: sections are interchangeable[\s\S]*4: every section[\s\S]*removal or reordering/i);
    assert.match(source, /Composition rhythm[\s\S]*0: alignment, visual mass, negative space, span, and density[\s\S]*4: alignment, visual mass, negative\s+space, span, and density vary deliberately/i);
    assert.match(source, /Concept-specific form[\s\S]*0: the result is a generic template[\s\S]*4: motif, anchor, and carrier arise from the domain/i);
    assert.match(source, /Responsive hierarchy[\s\S]*0: mobile is a shrunken\/stacked desktop[\s\S]*4: deliberate mobile recomposition/i);
    assert.match(source, /Type\/copy accommodation[\s\S]*0: real copy truncates[\s\S]*4: real Korean copy[\s\S]*fully integrated/i);
    assert.match(source, /Interaction\/form usability risk[\s\S]*0: the primary task cannot succeed[\s\S]*4: task success, immediate feedback/i);
    assert.match(source, /Accessibility\/implementation cost[\s\S]*0: contrast, focus\/order, reflow, or target reach[\s\S]*4:[\s\S]*applicable finish details/i);
  }
  assert.match(eye, /do not reward a terminal form[\s\S]*above the fold/i);
  assert.match(eye, /concept-specific-form credit only[\s\S]*functional\s+relationship/i);
});

test('copy-eye provenance has one canonical format owner and role pointers', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const roles = [skill, eye];
  const exactFormat = /Mode: copy-editor[\s\S]*Review time: <ISO 8601 timestamp>[\s\S]*Reviewed copy-deck SHA-256: <64 lowercase hex>[\s\S]*Verdict: <non-empty verdict>[\s\S]*Findings:/;

  assert.match(loop, /exclusively owns the exact copy-eye report format/i);
  assert.match(loop, exactFormat);
  assert.equal([loop, ...roles].filter((source) => exactFormat.test(source)).length, 1);

  for (const source of roles) {
    assert.match(source, /(?:protocol\/human-design-loop\.md[\s\S]*exact copy-eye report format|exact copy-eye report format[\s\S]*protocol\/human-design-loop\.md)/i);
    assert.doesNotMatch(source, exactFormat);
    assert.match(source, /\.omd\/\.cache\/copy-eye\.md/);
    assert.match(source, /omd copy --review-check/);
    assert.match(source, /structure only[\s\S]*does not\s+prove[\s\S]*blindness/i);
    assert.match(source, /(?:does not|must not) compare[\s\S]*reviewed hash[\s\S]*current\s+deck/i);
    assert.match(source, /final\s+`?omd copy --check`?[\s\S]*separate evidence/i);
    assert.match(source, /never\s+(?:replace|overwrite|substitute)[\s\S]*(?:final\s+deck hash|later writer-revised\/final deck hash)/i);
  }

  assert.match(loop, /preserv[\s\S]*omd copy --review-check[\s\S]*writer revision/i);
  assert.match(skill, /preserv[\s\S]*omd copy --review-check[\s\S]*writer revision/i);
  for (const source of [loop, skill, hand]) {
    assert.match(source, /omd source --seal[\s\S]*omd source --check/);
    assert.match(source, /byte-freshness\s+evidence|byte freshness/i);
    assert.match(source, /(?:does\s+not\s+(?:claim|prove)|never\s+claim\s+it\s+proves)\s+semantic/i);
  }
});

test('UX task coverage schema has one canonical owner and mapping pointers', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const composer = read('src/agents/composer.agent.yaml');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const roles = [composer, skill];
  const exactRow = /T# \| production: \/route \| locator: selector \|/;

  assert.match(loop, /exclusively owns the exact `## UX task coverage` schema/i);
  assert.match(loop, exactRow);
  assert.equal([loop, ...roles].filter((source) => exactRow.test(source)).length, 1);

  for (const source of roles) {
    assert.match(source, /protocol\/human-design-loop\.md[\s\S]*do not restate or alter that protocol-owned schema/i);
    assert.doesNotMatch(source, exactRow);
  }
  assert.match(composer, /map every applicable stable `T#` row[\s\S]*`Task coverage matrix`[\s\S]*omd composition --check/i);
});
test('all-rejected structural selection has one isolated no-winner recovery round', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const eye = read('src/agents/eye.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  for (const source of [loop, skill, eye]) {
    assert.match(source, /no winner/i);
    assert.match(source, /never lowers?\s+the floor[\s\S]*selects?\s+the\s+closest candidate/i);
    assert.match(source, /visible evidence only[\s\S]*contract-level[\s\S]*execution-level/i);
  }
  for (const source of [loop, skill]) {
    assert.match(source, /contract-level[\s\S]*fresh composer[\s\S]*new\s+(?:composition\s+)?hash[\s\S]*invalidates?\s+every\s+old candidate/i);
    assert.match(source, /execution-level[\s\S]*(?:exactly )?one bounded (?:replacement|recovery) round[\s\S]*fresh sketch contexts?/i);
    assert.match(source, /same approved contracts[\s\S]*(?:assigned )?axis[\s\S]*only its own sanitized visible[\s\S]*(?:never|do not pass) numeric scores/i);
    assert.match(source, /fresh selector[\s\S]*If\s+(?:none|no\s+replacement)\s+passes[\s\S]*(?:reframe\s+and stop|reframe\/stop)[\s\S]*Never\s+(?:create|an automatic|retry)/i);
  }
  assert.match(eye, /candidate-local visible[\s\S]*coordinator can sanitize/i);
  assert.match(eye, /one bounded replacement round[\s\S]*Never recommend a second replacement round/i);
  assert.match(sketch, /single bounded replacement round[\s\S]*fresh context[\s\S]*same approved contracts[\s\S]*only your own sanitized visible/i);
  assert.match(sketch, /Never receive or infer numeric scores[\s\S]*prior candidate[\s\S]*another candidate[\s\S]*rationale/i);
  assert.match(composer, /contract-level no-winner recovery round[\s\S]*sanitized shared visible contract conflict[\s\S]*Never receive candidate renders, numeric scores[\s\S]*new composition\s+hash[\s\S]*invalidates every old candidate/i);
});

test('layout-composition eval keeps frozen facts, blind dimensions, and two held-out tasks', () => {
  const promptPaths = [
    'evals/layout-composition/prompts/01_magnetic-bearing.md',
    'evals/layout-composition/prompts/02_oral-history.md',
    'evals/layout-composition/prompts/03_hospital-maintenance.md',
  ];
  assert.deepEqual(promptPaths.map(sha256), [
    'd8c91a5c8115cb4fe22be631918c6ae4503a84a75dddadb7e93c75fa819adb75',
    'a6feb3c5c8d5b3f29c6f40cae743c106154107ee02223bed819d9e349ba2851b',
    '9c2db1b49cf0d221320eebab53d4808f8c1f72f3e4e621847da0fed745b41cd4',
  ]);
  const [magnetic, archive, hospital] = promptPaths.map(read) as [string, string, string];
  const rubric = read('evals/layout-composition/graders/blind-rubric.md');
  const heldout = read('evals/layout-composition/heldout.md');
  assert.match(magnetic, /NARO Dynamics[\s\S]*7\.8→3\.1 mm\/s[\s\S]*18% 감소[\s\S]*9시간 설치[\s\S]*AX-40[\s\S]*VQ/);
  assert.match(magnetic, /이름·회사 이메일·설비 종류·현재 진동값·메시지/);
  assert.match(archive, /파장기록소[\s\S]*12년간 184개 해안 지점[\s\S]*3,720개 기록[\s\S]*장소·날짜·기록자·전사문/);
  assert.match(archive, /샘플 기록 재생 버튼[\s\S]*재생 상태와 진행 상황/);
  assert.match(hospital, /CIRCA Care[\s\S]*미계획 정지 31% 감소[\s\S]*점검 누락 42% 감소[\s\S]*24시간 이내/);
  assert.match(hospital, /병원명·업무 이메일·장비군·보유 대수·최근 고장 내용/);
  for (const prompt of [magnetic, archive, hospital]) {
    assert.match(prompt, /React \+ Vite \+ TypeScript/);
    assert.match(prompt, /1280×900[\s\S]*390×844/);
  }
  assert.match(rubric, /0 — absent\/broken[\s\S]*4 — exceptional/);
  assert.match(rubric, /Task\/CTA clarity[\s\S]*Accessibility\/implementation cost/);
  assert.match(heldout, /Scenario 01 as the development task[\s\S]*Scenarios 02 and 03 sealed as held-out/);
});

test('source candidates are scanned, blindly triaged, repaired, and rescanned without becoming lint', () => {
  const protocol = read('core/protocol/slop-review.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const writer = read('src/agents/writer.agent.yaml');

  assert.ok(skill.indexOf('Production source now exists') < skill.indexOf('Now render sharp'));
  assert.ok(skill.indexOf('Now render sharp') < skill.lastIndexOf('`omd slop scan`'));
  assert.match(protocol, /confirmed[\s\S]*dismissed[\s\S]*needs-render/);
  assert.match(protocol, /`needs-render` is transitional[\s\S]*both `untriaged = 0` and `needs-render = 0`[\s\S]*not `candidates = 0`/);
  assert.match(loop, /Candidate presence is not a\s+failed gate/);
  assert.match(skill, /Final untriaged and needs-render counts are both zero/);
  assert.match(protocol, /never added together or\s+double-counted/i);
  assert.match(protocol, /rendered IR is authoritative/i);
  assert.match(eye, /candidate id, controlled signals, and review question[\s\S]*Never receive candidate path,[\s\S]*source line\/excerpt,[\s\S]*authorship/i);
  assert.match(hand, /repair only confirmed visual\/source candidates[\s\S]*rerender[\s\S]*`omd check`[\s\S]*rescan/i);
  assert.match(writer, /sole deck owner[\s\S]*repair the deck first[\s\S]*production\s+source to omd-hand/i);
  assert.match(protocol, /only `omd-writer` may modify `.omd\/copy-deck\.md`/);
});

test('source-review provenance is conceptual and does not recreate an upstream catalogue', () => {
  const protocol = read('core/protocol/slop-review.md');
  const rules = read('core/rules/builtin/slop.yaml');
  assert.match(protocol, /yetone\/kill-ai-slop/);
  assert.match(protocol, /accessed\s+2026-07-13/);
  assert.match(protocol, /no explicit licence[\s\S]*no upstream code, wording, example copy,\s+assets, catalogue, identifiers, or catalogue ordering/i);
  assert.doesNotMatch(protocol, /32[- ]tell|#(?:[1-9]|[12]\d|3[0-2])\b/i);
  assert.doesNotMatch(rules, /32-tell catalogue|Bucket \([abc]\)/i);
});

test('humanize uses discourse repair modes and preserves evidence without rhythm choreography', () => {
  const humanize = read('src/skills/omd-humanize/SKILL.md');
  const voice = read('core/theory/voice.md');
  const copy = read('core/protocol/copy-deck.md');
  assert.match(humanize, /Mode A — local repair[\s\S]*Mode B — reconstruct from facts/);
  assert.match(humanize, /Speaker[\s\S]*Listener[\s\S]*Situation[\s\S]*Intended change \/ next move[\s\S]*Genre and register[\s\S]*Facts and quotes/);
  assert.match(humanize, /Only `verified` facts may support shipped claims[\s\S]*`open` and\s+`fixture` facts cannot ship/);
  assert.match(humanize, /quote cannot stay\s+verbatim, remove it; never paraphrase it as a quote/i);
  assert.match(humanize, /Only\s+`omd-writer` changes `.omd\/copy-deck\.md`/);
  assert.match(copy, /Input contract[\s\S]*Mode[\s\S]*Fidelity[\s\S]*Root cause[\s\S]*Next action[\s\S]*Owner handoff/);
  assert.match(voice, /Static copy and live dialogue have different situations/);
  assert.match(voice, /no individual signal establishes authorship/i);
  assert.match(voice, /Product copy has no universal speech-level/i);
  assert.match(voice, /Use breath as contextual evidence, not a universal sentence rule/);
  assert.match(voice, /documentation, comparisons, and feature[\s\S]*may explain mechanism/i);
  assert.doesNotMatch(humanize, /30%|50%|only rewrite what a rule tagged|after two long sentences|four-word one/i);
  assert.doesNotMatch(voice, /vary deliberately|After two long sentences|dramatically short sentence/i);
  assert.doesNotMatch(voice, /any one of these signals[\s\S]*model wrote|Product\s+copy[^.]*해요체[^.]*without exception|No human founder|mark the\s+text as generated|Two Korean AI tells are real/i);
  assert.doesNotMatch(voice, /will not need connectives|never explains the product's own mechanism/i);
});

test('scout rejects derivative or convergent references, not premium sites using common patterns', () => {
  const scout = read('src/agents/scout.agent.yaml');
  const skill = read('src/skills/omd-scout/SKILL.md');
  for (const raw of [scout, skill]) {
    const source = raw.replace(/\s+/g, ' ');
    // The blunt "tally two or more slop signals and drop" heuristic over-rejected premium,
    // first-party references (e.g. a violet-brand SaaS like Linear) and is gone.
    assert.doesNotMatch(source, /two or more slop signals/i);
    // Rejection now targets derivative/convergent sources...
    assert.match(source, /reject[\s\S]*only when it is derivative or convergent/i);
    // ...while premium, intentional design using common patterns is explicitly protected.
    assert.match(source, /premium, first-party, intentional/i);
    assert.match(source, /convergence without an author/i);
  }
});

test('hand builds a user-directed reference to fidelity; ref distance is advisory', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const skill = read('src/skills/omd-scout/SKILL.md');
  const protocol = read('core/protocol/reference-assembly.md');
  for (const raw of [hand, skill, protocol]) {
    const source = raw.replace(/\s+/g, ' ');
    // The hand opens the selected reference's local part-image and builds against it image-to-code.
    assert.match(source, /local part-image/i);
    assert.match(source, /\.omd\/refs\//);
    assert.match(source, /image-to-code fidelity/i);
    // ref distance no longer blocks shipping — it is advisory.
    assert.match(source, /omd ref distance/i);
    assert.match(source, /advisory/i);
    assert.match(source, /never blocks shipping/i);
    assert.doesNotMatch(source, /omd ref distance` still (?:gates|blocks|guards)/i);
  }
});

test('scout captures by decision coverage, never by a targeted or announced reference count', () => {
  const skill = read('src/skills/omd-scout/SKILL.md');
  const agent = read('src/agents/scout.agent.yaml');
  for (const raw of [skill, agent]) {
    const source = raw.replace(/\s+/g, ' ');
    // Capture is per-decision and stops on convergence, not at a number.
    assert.match(source, /Capture strictly per decision/i);
    assert.match(source, /stop when another capture would not change any remaining decision/i);
    // A targeted, estimated, or announced reference count is forbidden as fabricated specificity.
    assert.match(source, /never choose, target, estimate, or announce a number or range of references/i);
    assert.match(source, /fabricated specificity|fake specificity/i);
  }
});

test('the one-risk requirement is functional, not thematic, on a product surface', () => {
  const expressive = read('core/theory/expressive.md');
  const source = expressive.replace(/\s+/g, ' ');
  assert.match(source, /On a `product` or quiet surface the risk is functional, not thematic/i);
  assert.match(source, /A named theme, a decorative metaphor, or a "memorable moment" is the wrong risk/i);
  assert.match(source, /"Memorable" is a marketing goal/i);
});

test('scout does not reflexively reach for famous benchmarks and searches in parallel', () => {
  const skill = read('src/skills/omd-scout/SKILL.md');
  const agent = read('src/agents/scout.agent.yaml');
  for (const raw of [skill, agent]) {
    const source = raw.replace(/\s+/g, ' ');
    assert.match(source, /reflexively web-search the same famous benchmarks/i);
    assert.match(source, /reference-grammar homogenization/i);
    assert.match(source, /Linear/);
    assert.match(source, /in parallel/i);
  }
});

test('voice cites Toss as a documented example, never a voice to copy', () => {
  const voice = read('core/theory/voice.md').replace(/\s+/g, ' ');
  assert.match(voice, /documented examples of register discipline, never as a voice to copy/i);
  assert.match(voice, /do not web-search a product's copy strings to imitate/i);
});

test('there is no direct-build escape; register gates distinctive, never whether the loop runs', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /exactly one structural-skip route/i);
  assert.match(skill, /is NOT a skip route/);
  assert.match(skill, /never whether the loop runs/i);
  assert.match(skill, /routing defect, not a lawful shortcut/i);
  const expressive = read('core/theory/expressive.md').replace(/\s+/g, ' ');
  assert.match(expressive, /gates how "distinctive" is judged, never whether the loop runs/i);
});

test('expressive distills FWA distinctly and gates the horizontal gallery to showpiece', () => {
  const source = read('core/theory/expressive.md').replace(/\s+/g, ' ');
  assert.match(source, /FWA \(thefwa\.com\) rewards a different axis than Awwwards/i);
  assert.match(source, /not as permission to abandon usability/i);
  assert.match(source, /### Horizontal scroll gallery/);
  assert.match(source, /composition\/horizontal-scroll-gallery\.md/);
});

test('the loop and eye gate colour strategy (60-30-10 / reserved accent)', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Colour strategy is part of the GREEN target/i);
  assert.match(loop, /SLOP-DIFFUSE-ACCENT/);
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /verify a legible 60-30-10 distribution/i);
  assert.match(eye, /diffuse or multi-hue accent/i);
});

test('the eye gates the accessible name of icon-only controls the IR cannot see', () => {
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /Every interactive control needs a discernible accessible name/i);
  const ux = read('core/theory/ux.md').replace(/\s+/g, ' ');
  assert.match(ux, /icon-only control cannot be judged deterministically without false positives/i);
});

test('data-viz theory gates chart honesty and is wired into hand and eye', () => {
  const dv = read('core/theory/data-viz.md').replace(/\s+/g, ' ');
  assert.match(dv, /Bar charts start at zero/i);
  assert.match(dv, /Cleveland & McGill/);
  assert.match(dv, /Choose the chart from the question/i);
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /theory\/data-viz\.md/);
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /data visualization, verify it does not lie/i);
});

test('marketing art direction is silently resolved from evidence instead of defaulting to one motion direction', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /explicit current-user register or motion instruction is a lock/i);
  assert.match(loop, /For `marketing`, compare exactly three evidence-grounded directions silently/i);
  assert.match(loop, /do not ask the user to choose or approve a direction/i);
  assert.match(loop, /`none` is legal when the selected direction has adequate static proof/i);
  assert.match(loop, /`one` is legal only when one declared motion hypothesis is eligible and activated by the selected direction/i);
  assert.doesNotMatch(loop, /motion defaults to `one`/i);
  assert.match(loop, /before the composer receives inputs/i);
  assert.match(loop, /only the selected, hash-bound decision, selected capture visibility, and applicable evidence bindings/i);
  assert.match(loop, /separate blind-quality and fidelity reviewers in isolated lanes/i);
  assert.match(loop, /never literalized into shipped copy/i);
});

test('the eye rejects a merely functional element as a marketing signature moment and demands a named departure', () => {
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /A merely functional element — a working copy button, a form, a nav, or a terminal that only runs a command — is baseline function, never the signature moment/i);
  assert.match(eye, /Clean, competent, and evenly balanced with no nameable departure is a distinction failure \(RED\)/i);
  // register scoping preserved — product/quiet is exempt from the thematic floor
  assert.match(eye, /on a `product` or quiet surface the correct risk is functional/i);
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /a merely functional element .* is baseline function, never the signature moment/i);
});

test('scout researches the real subject first and lets its identity anchor govern the gathering lanes', () => {
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /Research the subject before the references/i);
  assert.match(scout, /fix the subject's own identity anchor/i);
  assert.match(scout, /instead of the subject's own identity is the convergence-to-the-mean failure/i);
  assert.match(scout, /a colour lane keyed to the anchor palette/i);
  assert.match(scout, /a personality\/motif lane keyed to the anchor motif/i);
  assert.match(scout, /a layout lane and a motion lane drawn from high-craft award work/i);
  assert.match(scout, /plus award showcases \(Awwwards, FWA, GDWEB\) and their case studies/i);
  assert.match(scout, /this award-work lane is mandatory and reads the case study/i);
  assert.match(scout, /never clone a famous showcase/i);
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(framer, /record it in the frame as a research target/i);
  assert.match(framer, /The scout derives the visual anchor from it/i);
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /fixes the subject's own identity anchor \(its real palette and motif\) before any gathering lane runs/i);
  assert.match(loop, /Award showcases \(Awwwards, FWA, GDWEB\) and their case studies are part of this category/i);
  assert.match(loop, /the FWA\/Awwwards case write-up \(concept, stack, motion approach\) is studied alongside the hero capture/i);
  const proto = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  assert.match(proto, /## Subject anchor/i);
  assert.match(proto, /it governs the colour and motif every other lane serves/i);
});

test('the run closes by reporting usage (elapsed + tokens) in the final chat, never fabricated', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Close the final chat handback with this run's usage: run `omd usage`/i);
  assert.match(loop, /never replaced by a fabricated number/i);
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /close the final chat response with this run's usage: run `omd usage`/i);
});

test('the coordinator auto-selects the strongest reference candidate and never asks the user to pick', () => {
  const proto = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  assert.match(proto, /The coordinator selects the strongest candidate itself/i);
  assert.match(proto, /never pauses to ask the user to pick a candidate/i);
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /the coordinator selects the strongest itself/i);
  assert.match(loop, /does not ask the user to pick a candidate/i);
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /The coordinator selects the strongest candidate itself and records it with `omd ref select`/i);
  assert.match(skill, /does not pause to ask the user to pick a candidate/i);
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /The coordinator selects the strongest candidate itself/i);
  assert.match(scout, /never asks the user to pick a candidate/i);
});

test('a landing page for a tool is classified marketing, not product', () => {
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(framer, /a landing, homepage, or launch\/promo page whose job is to persuade a visitor to adopt, install, or buy — even for a developer tool, CLI, library, or API — is `marketing`, not `product`/i);
  assert.match(framer, /OMD's own landing is `marketing`/i);
  assert.match(framer, /A tool's operating UI — the dashboard, console, or editor the user works in after adopting it — is `product`/i);
});

test('the scout audits capture parallelism with omd ref audit', () => {
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /After capture, run `omd ref audit`/i);
  const skill = read('src/skills/omd-scout/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /After capture, run `omd ref audit`/i);
});

test('the framer and the loop require research gathering to run in parallel', () => {
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(framer, /Run your own research in parallel, not one at a time/i);
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /issues its independent searches, captures, and lookups in parallel, not one at a time/i);
});
test('candidate axes must be genuinely divergent macro-layouts, not one stack reskinned', () => {
  const composition = read('core/protocol/composition-contract.md').replace(/\s+/g, ' ');
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const sketch = read('src/agents/sketch.agent.yaml').replace(/\s+/g, ' ');
  // Divergence is a different macro-layout family, named per axis.
  assert.match(composition, /Genuine divergence is a different macro-layout family/i);
  assert.match(composition, /Name each axis's macro-layout family/i);
  // A single-column stack reskinned with cosmetic differences is one axis, a divergence failure.
  assert.match(composition, /share one macro-layout family and differ only cosmetically[\s\S]*are one axis, not\s+two, and are a divergence failure/i);
  // The blind selector rejects a non-divergent candidate set as a contract-level no-winner.
  assert.match(loop, /A candidate set that collapses to a single macro-layout family has not diverged/i);
  assert.match(loop, /treats it as a contract-level no-winner/i);
  // Each isolated sketch realizes its axis as a distinct macro-layout, not a reskin of the default stack.
  assert.match(sketch, /Realize that axis as its named\s+macro-layout family/i);
  assert.match(sketch, /never a cosmetic reskin of\s+the default single-column stack/i);
});
test('copy register is an authority-fit decision, not a soft default, and Korean copy avoids the spaced em-dash', () => {
  const voice = read('core/theory/voice.md').replace(/\s+/g, ' ');
  const writer = read('src/agents/writer.agent.yaml').replace(/\s+/g, ' ');
  // The speech level is chosen from audience + required authority; a soft 해요체 default on an authoritative landing is a miss.
  assert.match(voice, /Defaulting to a soft, conversational 해요체[\s\S]*is a register-fit miss, not a safe default/i);
  assert.match(writer, /Choose the register from this subject's audience and the authority its value claim needs/i);
  // The writer proactively avoids the spaced em-dash in Korean copy (SLOP-KO-EMDASH catches it at render).
  assert.match(writer, /Never use a spaced em-dash \( — \)\s*inside Korean copy/i);
});
test('the AI-SaaS tells name decorative geometric-glyph ornament, flagged as SLOP-ORNAMENT-GLYPH', () => {
  const expressive = read('core/theory/expressive.md').replace(/\s+/g, ' ');
  assert.match(expressive, /Decorative ornament[\s\S]*a different little geometric glyph on each card/i);
  assert.match(expressive, /A marker system is consistent and meaningful or it is absent/i);
  assert.match(expressive, /`SLOP-ORNAMENT-GLYPH`/);
});
test('a multi-screen stateful surface runs omd flow-probe with dead-end and state-loss as RED', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /spans two or more reachable screens[\s\S]*supplies `\.omd\/probes\/flow\.json` and runs `omd flow-probe`/i);
  assert.match(loop, /a dead end \(`FLOW-DEAD-END`\)/i);
  assert.match(loop, /state loss \(`FLOW-STATE-LOSS`\)/i);
  assert.match(loop, /On a `product`\/`mixed` surface both are RED/i);
  assert.match(loop, /makes cross-screen navigation and state-continuity claims only from this flow-probe evidence/i);
});
test('craft names smooth in-page navigation with a reduced-motion fallback', () => {
  const craft = read('core/theory/craft.md').replace(/\s+/g, ' ');
  assert.match(craft, /## Smooth in-page navigation/);
  assert.match(craft, /hard-jumps the viewport to its target is a polish gap/i);
  assert.match(craft, /scroll-behavior: smooth[\s\S]*scrollIntoView\(\{ behavior: 'smooth'/i);
  assert.match(craft, /Under `prefers-reduced-motion: reduce` it reverts to an instant jump/i);
});
test('the loop runs domain analysis before framing and records domain-brief.json', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /preflight -> domain analysis -> frame/);
  assert.match(loop, /## Domain analysis/);
  assert.match(loop, /records `\.omd\/domain-brief\.json`[\s\S]*`domain-brief-v1`[\s\S]*`omd domain check`/i);
  assert.match(loop, /two-role reference queries \(component design and top-tier craft\)/i);
  assert.match(loop, /Durable, reviewable state lives under `\.omd\/`: `domain-brief\.json`/);
});
test('the domain-analysis contract names both reference roles and the feeds', () => {
  const doc = read('core/protocol/domain-analysis.md').replace(/\s+/g, ' ');
  assert.match(doc, /\*\*component\*\* — role ①/i);
  assert.match(doc, /\*\*craft\*\* — role ②/i);
  assert.match(doc, /top-tier galleries/i);
  assert.match(doc, /It feeds the frame and the scout|feeds[\s\S]*frame[\s\S]*scout/i);
  assert.match(doc, /never designs.*writes? (?:production )?code|never designs, scaffolds, or writes production code/i);
});
test('reference-assembly names the two roles and gates role-② craft by measured reproduction', () => {
  const ra = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  assert.match(ra, /## Reference roles/);
  assert.match(ra, /\*\*① component design\*\*/);
  assert.match(ra, /\*\*② craft\*\*/);
  assert.match(ra, /`reference-craft-v1` motion signature/);
  assert.match(ra, /GATED by `verifyCraftReproduction` \(`omd craft-fidelity check`\)/);
  assert.match(ra, /static, faint, or scroll-dropping reproduction fails/i);
});
test('the scout consumes the domain brief and measures role-② craft references', () => {
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /Read `\.omd\/domain-brief\.json` first/);
  assert.match(scout, /`referenceQueries\.component` seeds role ①/);
  assert.match(scout, /`referenceQueries\.craft` seeds role ②/);
  assert.match(scout, /measure it with `omd craft-capture/);
  assert.match(scout, /lets `omd craft-fidelity` prove the built reproduction actually moves/);
  assert.match(scout, /- Bash\(omd craft-capture:\*\)/);
});
