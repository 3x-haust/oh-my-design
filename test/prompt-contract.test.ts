import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { INPUT_SKELETONS } from '../core/schema/inputs.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

test('type approval keeps tested treatments distinct from composed attention order', () => {
  const type = read('core/theory/typography.md').replace(/\s+/g, ' ');
  assert.match(type, /\[type-composition-boundary\]/);
  assert.match(type, /tested treatment.*composed role assignment/i);
  assert.match(type, /semantic heading level does not select the largest rung/i);
  assert.match(type, /not permission to shrink every heading/i);
  assert.match(type, /No new type value or approval is inferred/);
  const typesetter = read('src/agents/typesetter.agent.yaml').replace(/\s+/g, ' ');
  assert.match(typesetter, /tested treatment options.*unresolved role assignments/);
  assert.match(typesetter, /does not approve page-wide focal dominance/);
});

test('composition resolves type competition without waiving owner proof or user locks', () => {
  const contract = read('core/protocol/composition-contract.md').replace(/\s+/g, ' ');
  assert.match(contract, /\[type-composition-boundary\]/);
  assert.match(contract, /largest competing text mass/);
  assert.match(contract, /only among already proved treatments/);
  assert.match(contract, /explicit user locks/);
  assert.match(contract, /return the exact unresolved relationship to Typesetter/);
  assert.match(contract, /do not manufacture a passing fingerprint/);
  const composer = read('src/agents/composer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(composer, /type-composition-boundary/);
  assert.match(composer, /specimen approval is not page-hierarchy approval/);
  const sketch = read('src/agents/sketch.agent.yaml').replace(/\s+/g, ' ');
  assert.match(sketch, /explicit content-to-treatment assignments/);
  assert.match(sketch, /do not promote every H1 to the largest proved treatment/);
  assert.match(sketch, /never silently change a size, weight, or measure/);
});

test('production freezes coordinator audit writes until the signed owner result returns', () => {
  for (const path of ['src/skills/omd-ultradesign/SKILL.md', 'core/protocol/human-design-loop.md']) {
    const contract = read(path).replace(/\s+/g, ' ');
    assert.match(contract, /\[production-project-quiescence\]/);
    assert.match(contract, /before (?:launching the Hand transaction|launch)/i);
    assert.match(contract, /read-only across the entire project, including `\.omd\/\.cache`/);
    assert.match(contract, /(?:signed result returns|signed owner result returns)/);
  }
  assert.match(read('core/protocol/human-design-loop.md').replace(/\s+/g, ' '),
    /Do not save pack excerpts, redirect diagnostic logs into the project/);
  assert.match(read('src/skills/omd-ultradesign/SKILL.md'), /`protocol\/human-design-loop\.md` §State boundary/);
});

test('production quiescence permits observation without weakening failed-owner limits', () => {
  const protocol = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(protocol, /Non-writing status\/log reads/);
  assert.match(protocol, /mutation\/retry limits/);
  assert.match(protocol, /only after the transaction returns/);
  assert.match(read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' '), /existing handle/);
});

test('the adaptive route decides which stages and reference work exist without quotas', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(skill, /omd route classify --input \.omd\/\.cache\/route-input\.json --json/);
  assert.match(skill, /only the roles\/stages selected by the route/i);
  assert.match(skill, /there\s+is no reference quota/);
  assert.match(skill, /A UI request does not authorize repository\s+publication/);
  assert.match(skill, /Roles do not inspect `core\/\*\*`/);
  assert.match(scout, /only when the adaptive route selects it/);
  assert.match(scout, /no reference quota and no default candidate count/i);
  assert.match(hand, /Write only\s*inside its `allowedPaths`/);
  assert.ok(INPUT_SKELETONS.some((input) => input.command
    === 'omd route validate --input .omd/.cache/route-input.json --json'));
});

test('the loop pulls a derived stage brief instead of carrying the rules in prose', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(skill, /At each selected boundary, read `omd brief <stage>` as coordinator intake/);
  assert.match(skill, /protocol\/human-design-loop\.md` §Evidence handoff/);
  const handoff = read('core/protocol/human-design-loop.md');
  assert.match(handoff, /Never append it\s+unchanged to an isolated owner's task/);
  assert.match(handoff, /It derives ownership,\s+measured references, delivered contracts, schemas, renderer, prior renders, judges and blockers\s+from current disk/);
  assert.match(hand, /Start with the coordinator's role-safe production handoff/);
  assert.match(hand, /Do not reopen the source-aware raw brief/);
  for (const role of ['hand', 'scout', 'eye', 'composer', 'writer']) {
    assert.match(read(`src/agents/${role}.agent.yaml`), /Bash\(omd brief:\*\)/, role);
  }
});

test('durable protocol and hand own stack detail while the coordinator consumes detected evidence', () => {
  for (const source of [
    read('core/protocol/human-design-loop.md'),
    read('src/agents/hand.agent.yaml'),
  ]) {
    const contract = source.replace(/\s+/g, ' ');
    assert.match(contract, /plain HTML\/CSS\/JS/);
    assert.match(contract, /only when the user explicitly asks for one or the surface is a genuinely stateful application/i);
    assert.match(contract, /build in an existing (?:project's|repository's) stack/i);
    assert.match(contract, /never pins the stack/i);
  }
  assert.match(read('src/skills/omd-ultradesign/SKILL.md'), /omd stack --json/);
});

test('hand records stack evidence before first write and preserves existing surfaces', () => {
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /Before the first write, run `omd stack`/);
  assert.match(hand, /Record the stack choice and concrete evidence with `omd decision`/);
  assert.match(hand, /Always build in an existing project's stack instead of replacing it/);
  assert.match(hand, /a static page and needs no framework/);
});

test('selected copy work remains an isolated writer boundary', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const writer = read('src/agents/writer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  assert.match(skill, /copy `omd-writer`/);
  assert.match(skill, /copy isolation[\s\S]*conditional methods/);
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
  for (const source of [protocol, hand, eye]) {
    const contract = source.replace(/\s+/g, ' ');
    for (const phrase of ['primary task', 'frequent action', 'costliest', 'reachable state', 'visible feedback', 'mobile reach']) {
      assert.match(contract, new RegExp(phrase, 'i'));
    }
  }
  for (const source of [protocol, hand]) {
    assert.match(source, /stateful[\s\S]*primary\.json[\s\S]*recovery\.json[\s\S]*navigation-only[\s\S]*primary probe[\s\S]*static[\s\S]*N\/A/i);
  }
  assert.match(read('src/skills/omd-ultradesign/SKILL.md'), /task states[\s\S]*required by outcome\/UX contracts/);
  const handContract = hand.replace(/\s+/g, ' ');
  for (const phrase of ['native semantics', 'Preserve entered form values on error', 'block duplicate submission', 'reduced motion']) {
    assert.match(handContract, new RegExp(phrase, 'i'));
  }
  assert.match(eye, /no\s+interaction claim without matching probe evidence/i);
  assert.match(protocol, /Never add fake error, empty, or\s+recovery UI/);
});

test('Claude plugin reference rewriting knows writer and composer', () => {
  const claude = read('adapters/claude.ts');
  assert.match(claude, /AGENT_REF[^\n]*writer/);
  assert.match(claude, /AGENT_REF[^\n]*composer/);
});

test('composition is isolated and supplied before production', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const composer = read('src/agents/composer.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');

  assert.match(skill, /composition `omd-composer`/);
  assert.match(skill, /composition[\s\S]*conditional methods/);
  for (const source of [protocol, composer, hand]) assert.match(source, /omd composition --check/);
  assert.match(composer, /owns? only `.omd\/composition\.md`|write only `.omd\/composition\.md`/i);
  assert.match(composer, /raw screenshots[\s\S]*URLs[\s\S]*candidate renders/i);
  assert.match(sketch, /approved typography and\s+composition contracts[\s\S]*one axis assigned/i);
  assert.match(eye, /task\/CTA clarity[\s\S]*accessibility\/implementation cost/i);
  assert.match(hand, /Frame, copy-deck, type-proof,[\s\S]*changes invalidate/i);
});
test('reference synthesis ABI has one owner and roles route sanitized multi-axis records', () => {
  const composition = read('core/protocol/composition-contract.md');
  const loop = read('core/protocol/human-design-loop.md');
  const scout = read('src/agents/scout.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(composition, /^## Reference synthesis$/m);
  assert.match(composition, /structurally\s+validated[\s\S]*closed\s+Markdown\s+ABI/i);
  assert.match(composition, /Use every axis exactly once[\s\S]*Disposition is\s+exactly/i);
  for (const source of [scout, composer, eye]) assert.match(source, /protocol\/composition-contract\.md/);
  assert.match(scout, /Never pass raw URLs, screenshots, pixels/i);
  assert.match(composer, /raw screenshots[\s\S]*pixels[\s\S]*reference URLs/i);
  assert.match(eye, /never source identity, rationale, URLs, screenshots, pixels, or source descriptions/i);
  assert.match(scout, /emit one sanitized[\s\S]*strict `## Reference synthesis`[\s\S]*exact axis keys[\s\S]*dispositions[\s\S]*reasons/i);
  assert.match(composer, /Serialize[\s\S]*strict `## Reference synthesis` Markdown ABI/i);
  assert.match(eye, /failed `omd composition --check`[\s\S]*blocker/i);
  assert.match(loop, /list→detail workspace[\s\S]*non-default, non-first object[\s\S]*object-local state/i);
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
test('unselected concept studies transport content relationships before testing rendered hypotheses', () => {
  const contract = read('core/theory/imagegen.md').replace(/\s+/g, ' ');
  // Contract transport only: these assertions do not score the aesthetics of any render.
  assert.match(contract, /Before rendering an unselected concept study, the coordinator binds the actual content units, their proposed spatial relationship, and the predicted observable consequence in the existing decision record and generation prompt/);
  assert.match(contract, /consequence is a visible spatial\/content relationship or an observed interaction state, not an inferred comprehension or conversion gain/);
  assert.match(contract, /whole-page request[^.]*beginning, middle, and end[^.]*relevant transition/);
  assert.match(contract, /one horizontal image per section: a landscape-format study render of each section, not an image embedded in the designed section/);
  assert.match(contract, /After rendering, hide concept names and rationales and check whether the predicted relationship and consequence are actually visible/);
  assert.match(contract, /If they are missing, the output does not validly test that hypothesis; it is not evidence that the concept is infeasible/);
  assert.match(contract, /composer never contributes an upstream prompt or art-direction decision/);
});

test('roles keep composer downstream of the chosen draft without image-generation duties', () => {
  const scout = read('src/agents/scout.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  const normalizedScout = scout.replace(/\s+/g, ' ');
  const normalizedComposer = composer.replace(/\s+/g, ' ');
  const normalizedEye = eye.replace(/\s+/g, ' ');

  assert.match(normalizedScout, /source screenshot is saved under `\.omd\/refs\/` as Scout-owned raw evidence/i);
  assert.match(normalizedScout, /not automatically a Composer or Hand input/i);
  assert.match(normalizedScout, /Several unique influences may bind one zone/i);
  assert.match(normalizedScout, /sanitized assembly carries measured principles and a skin-abstracted blueprint/i);
  assert.match(normalizedComposer, /does not generate images, manage a draft cache, select a draft, or record a decision\./i);
  assert.match(normalizedComposer, /analyzes and translates the chosen draft into[\s\S]*consuming it solely as art-direction input/i);
  assert.doesNotMatch(normalizedComposer, /omd ref add .+--shot|\.omd\/\.cache\/imagegen|record the paths and the pick/i);
  assert.match(normalizedEye, /protocol\/composition-contract\.md.*authoritative/i);
  assert.match(normalizedEye, /both task performance and visual composition across desktop and mobile/i);
});

test('focal hierarchy and selector floor stay in their owned contracts', () => {
  const composition = read('core/protocol/composition-contract.md');
  const loop = read('core/protocol/human-design-loop.md');
  const composer = read('src/agents/composer.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');

  assert.match(composition, /^## Focal hierarchy$/m);
  for (const source of [composition, composer, hand]) {
    assert.match(source, /dominant anchor[\s\S]*visual-mass\s+budget[\s\S]*value\/proof\/CTA/i);
    assert.match(source, /photo is never mandatory|never mandate a photo|never a\s+mandatory photo|Do not mandate a photo/i);
  }
  assert.match(sketch, /four structural proofs[\s\S]*1280x900[\s\S]*390x844[\s\S]*full-page desktop[\s\S]*full-page mobile/i);
  for (const source of [loop, eye]) {
    assert.match(source, /0\s+(?:=\s*)?absent\/broken[\s\S]*4\s+(?:=\s*)?exceptional/i);
    assert.match(source, /eight integer(?:s| scores)[\s\S]*arithmetic mean/i);
  }
  assert.match(eye, /do not reward a terminal form[\s\S]*above the fold/i);
});

test('copy-eye provenance has one canonical format owner and role pointer', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const exactFormat = /Mode: copy-editor[\s\S]*Review time: <ISO 8601 timestamp>[\s\S]*Reviewed copy-deck SHA-256: <64 lowercase hex>[\s\S]*Verdict: CLEAN[\s\S]*Verdict: REVISE[\s\S]*Findings:/;

  assert.match(loop, /exclusively owns the exact copy-eye report format/i);
  assert.match(loop, exactFormat);
  assert.doesNotMatch(eye, exactFormat);
  assert.match(eye, /\.omd\/\.cache\/copy-eye\.md/);
  assert.match(eye, /omd copy --review-check/);
  for (const source of [loop, hand]) {
    assert.match(source, /omd source --seal[\s\S]*omd source --check/);
    assert.match(source, /byte-freshness\s+evidence|byte freshness/i);
  }
});

test('UX task coverage schema has one canonical owner and composer pointer', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const composer = read('src/agents/composer.agent.yaml');
  const exactRow = /T# \| production: \/route \| locator: selector \|/;

  assert.match(loop, /exclusively owns the exact `## UX task coverage` schema/i);
  assert.match(loop, exactRow);
  assert.doesNotMatch(composer, exactRow);
  assert.match(composer, /protocol\/human-design-loop\.md[\s\S]*do not restate or alter that protocol-owned schema/i);
  assert.match(composer, /map every applicable stable `T#` row[\s\S]*`Task coverage matrix`[\s\S]*omd composition --check/i);
});
test('all-rejected structural selection has one isolated no-winner recovery round', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const eye = read('src/agents/eye.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  for (const source of [loop, eye]) {
    assert.match(source, /no winner/i);
    assert.match(source, /visible evidence only[\s\S]*contract-level[\s\S]*execution-level/i);
  }
  assert.match(loop, /contract-level[\s\S]*fresh composer[\s\S]*invalidates?\s+every\s+old candidate/i);
  assert.match(loop, /execution-level[\s\S]*(?:exactly )?one bounded (?:replacement|recovery) round/i);
  assert.match(eye, /one bounded replacement round[\s\S]*Never recommend a second replacement round/i);
  assert.match(sketch, /single bounded replacement round[\s\S]*fresh context/i);
  assert.match(composer, /contract-level no-winner recovery round[\s\S]*new composition\s+hash/i);
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

test('source candidates are triaged by the owned protocol and roles, not duplicated in the coordinator', () => {
  const protocol = read('core/protocol/slop-review.md');
  const loop = read('core/protocol/human-design-loop.md');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const writer = read('src/agents/writer.agent.yaml');

  assert.match(protocol, /confirmed[\s\S]*dismissed[\s\S]*needs-render/);
  assert.match(protocol, /`needs-render` is transitional[\s\S]*both `untriaged = 0` and `needs-render = 0`/);
  assert.match(loop, /Candidate presence is not a\s+failed gate/);
  assert.match(protocol, /rendered IR is authoritative/i);
  assert.match(eye, /candidate id, controlled signals, and review question/i);
  assert.match(hand, /repair only confirmed visual\/source candidates[\s\S]*rerender[\s\S]*`omd check`[\s\S]*rescan/i);
  assert.match(writer, /sole deck owner[\s\S]*repair the deck first/i);
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
    assert.doesNotMatch(source, /convergence without an author/i);
  }
});

test('hand builds selected references to a blocking slot-scoped fidelity gate', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const skill = read('src/skills/omd-scout/SKILL.md');
  const protocol = read('core/protocol/reference-assembly.md');
  assert.match(hand.replace(/\s+/g, ' '), /raw file under `\.omd\/refs\/` is Scout provenance/i);
  assert.match(skill.replace(/\s+/g, ' '), /raw file under `\.omd\/refs\/` is Scout provenance/i);
  assert.match(protocol.replace(/\s+/g, ' '), /Raw captures remain Scout provenance/i);
  for (const raw of [hand, skill, protocol]) {
    const source = raw.replace(/\s+/g, ' ');
    // Raw captures need an explicit selected visual projection; board-v3 still has promise proof.
    assert.match(source, /omd ref[\s\S]*influence-proof/i);
    assert.match(source, /\.omd\/refs\//);
    assert.match(source, /omd ref distance/i);
    assert.match(source, /bare[\s\S]*advisory/i);
    assert.match(source, /--selected[\s\S]*--gate[\s\S]*--json/i);
    assert.match(source, /0\.6/);
    assert.match(source, /(?:failed|missing)[\s\S]*(?:malformed|unmeasurable|stale)[\s\S]*blocks/i);
  }
});

test('selected visual packets expose only no-ship neutral geometry to downstream roles', () => {
  const protocol = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  const composer = read('src/agents/composer.agent.yaml').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  for (const source of [protocol, composer, hand, scout, skill]) assert.match(source, /omd ref visual-packet|reference-visual-packet/i);
  for (const source of [protocol, composer, hand, skill]) {
    assert.match(source, /no-ship/i);
    assert.match(source, /source-free|source identity/i);
  }
  assert.match(protocol, /box proportion[\s\S]*grouping[\s\S]*nesting[\s\S]*whitespace/i);
  assert.match(protocol, /drops source colour, copy, identity, imagery, and typeface/i);
  assert.match(composer, /Never read `.omd\/reference-visual-packet-evidence\.json`/i);
  assert.match(hand, /visual-packet-check --production/i);
  assert.match(scout, /coordinator alone may run `omd ref visual-packet`/i);
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
  assert.match(source, /On a `product` surface the risk is functional, not thematic/i);
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

test('every route retains evidence, production, observation, and blind review', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /production evidence, accessibility, or independent review/i);
  assert.match(skill, /Production remains owned by `omd-hand`/i);
  assert.match(skill, /decision-linked browser evidence and fresh independent `omd-eye` review always end the route/i);
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

test('the loop and eye gate surface-conditional colour strategy', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Colour strategy is part of the GREEN target/i);
  assert.match(loop, /SLOP-DIFFUSE-ACCENT/);
  assert.match(loop, /60-30-10 is a diagnostic starting point, not a fixed area obligation/i);
  assert.match(loop, /achromatic or near-monochrome direction is lawful/i);
  assert.match(loop, /eye decides whether that warning is an unconsidered default/i);
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /60-30-10 split is a diagnostic starting point, never a required area ratio/i);
  assert.match(eye, /achromatic or multi-hue palette is lawful/i);
  assert.match(eye, /For a product, verify semantic colour/i);
  assert.match(eye, /diffuse or multi-hue accent/i);
  assert.match(eye, /RED requires visible evidence of competing accents/i);
  assert.match(eye, /White, near-white, dark, tinted, cream, beige, paper-like, and material grounds receive the same evidence standard/i);
  assert.doesNotMatch(eye, /safe baseline/i);
  assert.match(hand, /explicitly evidenced achromatic\/multi-hue system/i);
  assert.match(hand, /White, near-white, dark, tinted, cream, beige, paper-like, and material grounds receive the same evidence standard/i);
  assert.doesNotMatch(hand, /safe baseline/i);
});

test('refinement status is evidence-driven rather than biased by round number', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /A round earns GREEN or RED from its current evidence; the round number itself never prejudges the result/i);
  assert.doesNotMatch(loop, /Round 0 is almost never GREEN/i);
  assert.match(loop, /initial clean build is judged by its independent final quality review/i);
  assert.match(loop, /only an actual repair\/refinement pair requires the blind-choose after to beat before/i);
  assert.match(loop, /Reviewer disagreement or a tie with a remaining RED criterion returns to framing\/composition/i);
  assert.match(loop, /second chained tie on that same RED target is a genuine plateau/i);
  assert.match(loop, /unanimous tie with no remaining criterion records the repaired result as preserved and complete without claiming improvement/i);
  assert.match(loop, /remaining RED never completes/i);
});

test('reference implementation consumes source-free projection and optional no-ship packet', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const composition = read('core/protocol/composition-contract.md').replace(/\s+/g, ' ');
  assert.match(loop, /source-free selected assembly/i);
  assert.match(loop, /optional source-free no-ship visual packet/i);
  assert.match(loop, /never opens Scout-owned captures or private packet evidence/i);
  assert.match(composition, /assigned source-free reference projection[\s\S]*no-ship visual packet/i);
  assert.match(composition, /measured-part fidelity/i);
  assert.match(composition, /Hand never inspects Scout-owned source pixels or private packet evidence/i);
  assert.doesNotMatch(composition, /builds each section against its assigned reference part/i);
  assert.doesNotMatch(composition, /with image-to-code fidelity/i);
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

test('marketing art direction is selected from evidence instead of a fixed candidate ritual', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /art direction[\s\S]*present only when selected by the typed route/i);
  assert.match(loop, /No route has a universal capture or candidate quota/i);
  assert.doesNotMatch(loop, /motion defaults to `one`/i);
  assert.match(loop, /When a method is selected, its owner, artifact boundary, validation, browser fallback, and stop conditions/i);
});

test('the eye scopes signature departure to marketing and exempts product theatre', () => {
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /A merely functional element — a working copy button, a form, a nav, or a terminal that only runs a command — is baseline function, never the signature moment/i);
  assert.match(eye, /Clean, competent, and evenly balanced marketing with no nameable departure is a distinction failure \(RED\)/i);
  assert.match(eye, /on a `product` surface the correct risk is functional/i);
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /A merely functional element is not a marketing signature, but it may correctly be the dominant product work object/i);
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

test('the run closes with measured usage, never fabricated', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Close the final chat handback with this run's usage: run `omd usage`/i);
  assert.match(loop, /never replaced by a fabricated number/i);
});

test('reference selection remains model-owned and evidence-bound when selected', () => {
  const proto = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  assert.match(proto, /adaptive route may select discovery alone/);
  assert.match(proto, /no universal stage count,[\s\S]*reference quota, or candidate quota/);
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /only when the adaptive route selects it/);
  assert.match(scout, /intended and actual evidence use/i);
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
test('copy register is an authority-fit decision, not a soft default', () => {
  const voice = read('core/theory/voice.md').replace(/\s+/g, ' ');
  const writer = read('src/agents/writer.agent.yaml').replace(/\s+/g, ' ');
  // The speech level is chosen from audience + required authority; a soft 해요체 default on an authoritative landing is a miss.
  assert.match(voice, /Defaulting to a soft, conversational 해요체[\s\S]*is a register-fit miss, not a safe default/i);
  assert.match(writer, /Choose the register from this subject's audience and the authority its value claim needs/i);
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
test('domain analysis is a mandatory stage that records its typed artifact', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Domain analysis is a mandatory stage/);
  assert.match(loop, /## Domain analysis/);
  assert.match(loop, /records `\.omd\/domain-brief\.json`[\s\S]*`domain-brief-v1`[\s\S]*`omd domain check`/i);
  assert.match(loop, /two-role reference queries \(component design and top-tier craft\)/i);
  assert.match(loop, /UNSOURCED_DOMAIN_CLAIM/);
  assert.match(loop, /Durable, reviewable state lives under `\.omd\/`: `domain-brief\.json`/);
});
test('the domain-analysis contract names both reference roles, the source rule, and the planning rule', () => {
  const doc = read('core/protocol/domain-analysis.md').replace(/\s+/g, ' ');
  assert.match(doc, /\*\*component\*\* — role ①/i);
  assert.match(doc, /\*\*craft\*\* — role ②/i);
  assert.match(doc, /top-tier galleries/i);
  assert.match(doc, /It feeds the frame and the scout|feeds[\s\S]*frame[\s\S]*scout/i);
  assert.match(doc, /never designs.*writes? (?:production )?code|never designs, scaffolds, or writes production code/i);
  assert.match(doc, /UNSOURCED_DOMAIN_CLAIM/);
  assert.match(doc, /UNSOURCED_PLANNING_CLAIM/);
  assert.match(doc, /Planning is asked, not researched/i);
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
test('adaptive routing supplies selected contracts instead of duplicating them in the coordinator', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /only the roles\/stages selected by the route/i);
  assert.match(skill, /For each selected contract:/);
  const stage = read('core/stage/contract.ts');
  assert.match(stage, /id: 'domain'[\s\S]*artifact: '\.omd\/domain-brief\.json'/);
});
test('writer rejects intake-recap headlines that hide the next action', () => {
  const writer = read('src/agents/writer.agent.yaml');
  assert.match(writer, /다시 오셨네요/);
  assert.match(writer, /지금 할 일을 먼저 볼게요/);
  assert.match(writer, /최근 퇴사 상황을 바탕으로/);
  assert.match(writer, /concrete next action/);
});
test('coordinator gates application source while allowing selected parallel research/copy authoring', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /do not write application source until the current route and all selected pre-production inputs pass `omd guard production`/i);
  assert.match(skill, /Selected discovery needs actual reference evidence/);
  assert.match(skill, /explicitly skipped discovery stage is not forced onto a copy-only edit/);
  assert.match(skill, /Writer may run alongside Scout/);
  assert.match(skill, /Writer publishes the copy deck and completes its current copy-edit review/);
  assert.match(skill, /Typesetter proves the actual language\/copy before Composer/);
  assert.match(skill, /Render captures of the generated app are not design references/i);
});test('the coordinator auto-continues after domain analysis and asks only for material unknowns', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  const oneShot = skill.slice(skill.indexOf('## One-shot execution'), skill.indexOf('## Reference roles'));
  assert.match(oneShot, /selected research\/copy\/type passes → selected composition\/candidates → guard production/);
  assert.match(oneShot, /rendered review\/repair\/recheck → guard completion/);
  assert.match(oneShot, /not a substitute for `route.strategy.stages`/);
  assert.match(oneShot, /advance automatically/i);
  assert.doesNotMatch(oneShot, /wait for confirmation/);
  assert.match(skill, /Do not ask the user to choose references or a visual direction/i);
  assert.match(skill, /market\/target audience/i);
  assert.match(skill, /product's real capability/i);
  assert.match(skill, /discovery versus continuing an existing application/i);
});

test('reference-assembly names three roles over two axes, and the visual-only restriction', () => {
  const ra = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  assert.match(ra, /Every reference serves one of three roles/i);
  assert.match(ra, /\*\*③ mood\*\*/);
  assert.match(ra, /### The two axes/);
  assert.match(ra, /A visual-only capture may never support a structural claim/i);
  assert.match(ra, /core\/visual-vector\.ts/);
  assert.match(ra, /MOOD_BYTES_IN_PRODUCTION/);
  assert.match(ra, /advisory/i);
});
test('the moodboard protocol states the lane grade and the hard rights rule', () => {
  const mood = read('core/protocol/moodboard.md').replace(/\s+/g, ' ');
  assert.match(mood, /scope: whole/);
  assert.match(mood, /evidence: visual-only/);
  assert.match(mood, /MOOD_BYTES_IN_PRODUCTION/);
  assert.match(mood, /a moodboard is study material for direction/i);
  assert.match(mood, /not a licence to ship its pixels/i);
  assert.match(mood, /MOOD_OFF_STORE_PATH/);
  assert.match(mood, /MOOD_STRUCTURAL_QUALITY/);
});
test('the coordinator skill names the reference roles and their commands', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /## Reference roles/);
  assert.match(skill, /omd ref mood/);
  assert.match(skill, /omd ref gates/);
  assert.match(skill, /omd ref granularity/);
});
test('generated project documents stay inside the omd record', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /under `\.omd\/docs\/\<project\>\/`/);
  assert.match(skill, /Never create a project-root `docs\/` directory/i);
});
test('composition consumes judgment and first-render gestalt before final polish', () => {
  const composer = read('src/agents/composer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(composer, /Read the persisted `DesignHypothesis`/);
  assert.match(composer, /omd judgment check/);
  assert.match(composer, /omd first-render check/);
  assert.match(composer, /dominant object/);
  assert.match(composer, /utility chrome overrides the task/);
  const critic = read('core/design/first-render-critic.ts');
  assert.match(critic, /PURPOSE_UNCLEAR/);
  assert.match(critic, /DOMINANT_OBJECT_MISSING/);
  assert.match(critic, /COMPARISON_TOO_THIN/);
  assert.match(critic, /TRUST_SIGNAL_MISSING/);
});
test('captured role-② craft cannot override the selected exact motion decision', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /never turns captured scroll craft into an additional motion obligation beyond the exact selected `motionDecision`/i);
  assert.match(loop, /Never default motion to `one`/);
  assert.match(loop, /A `product` surface[\s\S]*exempt/i);
});
test('craft-usage motion authority stays in the owned protocol when applicable', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /When a method is selected, its owner, artifact boundary, validation, browser fallback, and stop conditions/i);
  assert.match(loop, /never turns captured scroll craft into an additional motion obligation beyond the exact selected `motionDecision`/);
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  assert.match(skill, /task states, viewports, interactions, reduced motion and recovery required by outcome\/UX/);
});
test('the loop and the hand install pack recipes instead of reimplementing them', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /A pack recipe is installed, not reimplemented/);
  assert.match(loop, /`omd recipe add <name> \[--stack react\|vanilla\]` writes that recipe's real source/);
  assert.match(loop, /remain within the selected exact-one decision/);
  assert.match(loop, /verified with `omd craft-capture` before the technique is claimed/);

  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /Do not reimplement a pack recipe from its document/);
  assert.match(hand, /- Bash\(omd recipe:\*\)/);
  assert.match(hand, /Install first, then do the work a build is actually good at/);
});
test('the loop requires motion to enhance content, never gate it (omd no-js)', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Motion enhances content; it never gates it/);
  assert.match(loop, /runs `omd no-js <page>`/);
  assert.match(loop, /`NOJS-CONTENT-LOSS` is RED/);
  assert.match(loop, /content accessible with no JS/);
  assert.match(loop, /Below-fold content that has simply not been scrolled to yet is not a loss/);
});
test('the loop scores against the published Awwwards developer rubric', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /`omd award score <page>` scores the page against the published Awwwards Developer Award rubric/);
  assert.match(loop, /WPO 0\.20, RWD\/mobile 0\.20, markup\/metadata 0\.15, semantics\/SEO 0\.20, animations\/transitions 0\.15, accessibility 0\.10/);
  assert.match(loop, /Scoring is conjunctive: an axis below its floor forces the verdict down/);
  assert.match(loop, /Honourable Mention is 6\.5; the Developer Award is above 7/);
  assert.match(loop, /does not fake a number for it/);
});
test('the loop commits the design system ladders before composition', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Commit the approved design-system ladders before composition/);
  assert.match(loop, /authorized owner writes `\.omd\/tokens\.json`/);
  assert.match(loop, /at least four positive ascending unique rungs, adjacent ratio at least 1\.15, and total span at least 2\.5 except for `quiet` and `product`/);
  assert.match(loop, /contract checks, not a visual-quality verdict/);
  assert.match(loop, /`omd schema token-commit --json`/);
  assert.match(loop, /`omd schema responsive-token-commit --json`/);
  assert.match(loop, /command validates only.*never copied or published/);
  assert.match(loop, /first inclusive CSS viewport-width cap that matches wins/);
  assert.match(loop, /never union mutually exclusive sizes or alter approved type/);
  assert.match(loop, /`TOKEN-DRIFT` checks rendered type against only that width's active scale/);
});
test('motion theory names the implementation stack and the frequency counter-rule', () => {
  const motion = read('core/theory/motion.md').replace(/\s+/g, ' ');
  assert.match(motion, /## The implementation stack/);
  assert.match(motion, /`animation-timeline: view\(\)`\/`scroll\(\)` is the default/);
  assert.match(motion, /GSAP became free for every use in 2024 under Webflow's stewardship/);
  assert.match(motion, /`ScrollTrigger` with `scrub: true` is scroll-position-scrubbed/);
  assert.match(motion, /a time-driven `ScrollTrigger` callback is not, and does not qualify/);
  assert.match(motion, /high-frequency, keyboard-initiated interaction[\s\S]*better without\* an entrance animation/);
  assert.match(motion, /CSS animations and the Web Animations API keep running regardless/);
});

test('the award-bar eval scores against the rubric, tokens, installs, and no-JS survival', () => {
  const prompt = read('evals/award-bar/prompt.md').replace(/\s+/g, ' ');
  assert.match(prompt, /published Awwwards Developer Award rubric rather than an internal target/);
  const score = read('evals/award-bar/graders/award-score.md').replace(/\s+/g, ' ');
  assert.match(score, /`coverage` of at least 0\.8/);
  assert.match(score, /`floorFailures` is empty/);
  const tokens = read('evals/award-bar/graders/tokens-committed.md').replace(/\s+/g, ' ');
  assert.match(tokens, /A two-rung type scale such as `\[12, 16\]` is the collapsed case/);
  const install = read('evals/award-bar/graders/installed-not-reimplemented.md').replace(/\s+/g, ' ');
  assert.match(install, /records at least one `omd recipe add` install/);
  const nojs = read('evals/award-bar/graders/content-survives-no-js.md').replace(/\s+/g, ' ');
  assert.match(nojs, /content accessible with no JS/);
});
test('selected artifact ownership is enforced in both the loop and compact coordinator', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Artifact ownership is enforced whenever an artifact is selected/);
  assert.match(loop, /`\.omd\/composition\.md` to the composer/);
  assert.match(loop, /every production source file to the hand/);

  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  assert.match(skill, /Artifact ownership remains exclusive:/);
  assert.match(skill, /composition `omd-composer`/);
  assert.match(skill, /production\/observations `omd-hand`/);
  assert.match(skill, /missing selected owner is a visible\s+blocker/i);
  assert.match(skill, /Freeze route\/source\/locale\s+until owners return/);
});
test('production ownership distinguishes the initial owner from an authorized repair owner', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /For the initial production pass, do not launch or resume a second Hand owner outside this transaction/i);
  assert.match(skill, /After a successful initial owner and fresh trusted observation, the authorized repair transaction may launch the dedicated `omd-hand` repair owner once against its external private mirror/i);
  assert.match(skill, /it is not a second initial Hand and cannot write production or `\.omd`/i);
  assert.match(skill, /Only lifecycle repair may publish its one-file mirror change/i);
});
test('production owner transaction cannot mutate upstream or evidence artifacts', () => {
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /source-owner transaction mutates only the route's `allowedPaths`/);
  assert.match(hand, /does not write `\.omd\/` history, decisions, screenshots, observations, or caches/);
  assert.match(hand, /Return proposed evidence and decision records in the final owner result/);
  assert.match(hand, /Every source-owner `omd check` uses `--no-log`/);
});
test('the scout and the reference protocol require component-scoped capture', () => {
  const ra = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  assert.match(ra, /## Capture granularity/);
  assert.match(ra, /a capture scoped to a page root — `main`, `body`, `html`, `:root` — measures the whole document/);
  assert.match(ra, /Granularity alone is not coverage/);
  assert.match(ra, /three navs and two install blocks — are two parts studied repeatedly/);
  assert.match(ra, /Domain-brief `surfaces` are pages\/screens/);
  assert.match(ra, /The framer therefore writes `\.omd\/acquisition-plan\.json`/);
  assert.match(ra, /finished only when every required zone has at least one bound capture/);
  assert.match(ra, /`REF-ZONE-UNCOVERED`, and `REF-NAME-MISMATCH`/);
  assert.match(ra, /A capture is named for what it holds/);
  assert.match(ra, /tracing a whole page is the derivative failure the transfer boundary forbids/);

  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /Capture parts, not pages/);
  assert.match(scout, /retain distinct measured viewports as complementary observations, never as independent sources/);
  assert.match(scout, /Resolve same-viewport aliases or missing viewport evidence/);
  assert.match(scout, /State-preserving preparation requires explicit `--no-energy` or `energy:false`/);
  assert.match(scout, /it cannot satisfy a positive-motion claim/);
  assert.match(scout, /Run `omd ref granularity` before handing the board on/);
  assert.match(scout, /Cover the result, not one slot/);
  assert.match(scout, /`omd ref add <url> --as <component> --lane design --slot <zone> --selector "<css>" --blueprint --shot`/);
  assert.match(scout, /`REF-ZONE-UNCOVERED` names the zones that still have none/);
  assert.match(scout, /Name a capture for what it holds/);
  assert.match(scout, /`REF-NAME-MISMATCH` reports it/);
  assert.match(scout, /a nav studied three times while the hero, process, and proof zones have nothing/);
});

test('scout can write only its owned synthesis while reference records stay CLI-owned', () => {
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /- Write - Edit - apply_patch deny: \[\]/);
  assert.match(scout, /Outside those command-owned records, write or edit only `\.omd\/scout\.md`/);
  assert.match(scout, /Never touch production source, another `\.omd\/` artifact/);
});

test('browser evidence requires a settled visible capture contract', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  for (const source of [loop, eye]) {
    assert.match(source, /\[settled-capture-contract\]/);
    assert.match(source, /getAnimations\(\)/);
    assert.match(source, /display[\s\S]*visibility[\s\S]*opacity/);
    assert.match(source, /omd capture --check --input/);
  }
});

test('protocol review receives complete receipts and pair-distinct configurations', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  for (const source of [loop, eye, skill]) {
    assert.match(source, /\[protocol-review-packet-contract\]/);
    assert.match(source, /every primary screenshot[\s\S]*capture receipt/i);
  }
  for (const source of [loop, skill]) {
    assert.match(source, /\[review-pair-configuration-contract\]/);
    assert.match(source, /pair-distinct reviewer configuration/i);
    assert.match(source, /identical evidence payload/i);
  }
  assert.match(loop, /\[host-authority-role-launch-contract\]/);
  assert.match(loop, /serialize role launches/i);
  assert.match(loop, /pre-execution authority rejection[\s\S]*not a review result/i);
  for (const source of [loop, eye]) {
    assert.match(source, /\[self-contained-review-packet-contract\]/);
    assert.match(source, /full validated receipt projection/i);
    assert.match(source, /never run bare `omd check`/i);
    assert.match(source, /advisory warnings?[\s\S]*not automatic RED/i);
    assert.match(source, /\[review-packet-proof-contract\]/);
    assert.match(source, /exact `omd proof --check --json` result[\s\S]*`\[\]`/i);
    assert.match(source, /full packet bytes[\s\S]*role input/i);
    assert.match(source, /blind[\s\S]*no URLs[\s\S]*provenance/i);
    assert.match(source, /benchmark applicability[\s\S]*reality boundary/i);
  }
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /\[semantic-heading-order-contract\]/);
  assert.match(hand, /never skip a heading level/i);
  assert.match(hand, /\[source-owner-browser-boundary\]/);
  assert.match(hand, /Never invoke `omd render`, `omd ir`, `omd probe`, `omd lifecycle`, Playwright, browser-rs/);
  assert.match(hand, /coordinator routes browser observation and every `\.omd` evidence publication after this owner returns/i);
});

test('initial final Eyes receive anonymous production pixels through the isolated host transport', () => {
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(eye, /anonymous production pixels are inspectable only when the trusted host supplies them as in-memory `image\/png` blocks/i);
  assert.match(eye, /adaptive-final-render-reviewer-transport-v1/);
  assert.match(eye, /never a capture path, project file, source, rationale, URL, reference image, or provenance/i);
  assert.match(loop, /initial-final-production-pixel-contract/);
  assert.match(loop, /same host-owned neutral task and configuration to prevent caller bias/i);
  assert.match(loop, /Any RED verdict or below-floor axis from either Eye blocks publication/i);
  assert.match(loop, /Final-v2 independently revalidates both executions and recomputes that aggregate/i);
  assert.match(skill, /omd review final-packet[\s\S]*--reviewer-packet/i);
  assert.match(skill, /do not add `--input`/i);
  assert.match(skill, /raw capture path, URL, reference pixel, rationale, or provenance is invalid input/i);
});

test('production copy projection preserves omitted support and role multiplicity', () => {
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  for (const source of [hand, loop]) {
    assert.match(source, /\[copy-role-multiplicity-contract\]/);
    assert.match(source, /Supporting fact: none[\s\S]*zero support carriers/i);
    assert.match(source, /visible-string multiset/i);
  }
});

test('source-bound type and composition proofs are current before review', () => {
  const sources = [
    read('core/protocol/human-design-loop.md'),
    read('src/agents/typesetter.agent.yaml'),
    read('src/agents/composer.agent.yaml'),
    read('src/agents/hand.agent.yaml'),
    read('src/agents/eye.agent.yaml'),
  ].map((source) => source.replace(/\s+/g, ' '));
  for (const source of sources) {
    assert.match(source, /\[source-bound-proof-currentness\]/);
    assert.match(source, /omd proof --check/);
  }
});

test('scout batches zone-bound captures without debugging browser transport', () => {
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  assert.match(scout, /run the initial `omd ref add-batch` once/);
  assert.match(scout, /Every entry includes a tight component selector and the framer-owned `slot`/);
  assert.match(scout, /`reference-board` stage owns board\/candidate assembly/);
  assert.match(scout, /`candidate-generation` is a separate structural-sketch stage owned by `omd-sketch`/);
  assert.match(scout, /Never interpret a skipped or selected `candidate-generation` stage as a skipped or selected reference board/i);
  assert.match(scout, /Never start `browser-rs` yourself, handcraft or `curl` its MCP protocol/);
  assert.match(scout, /if that provider is not callable on the current host\/connection/i);
  assert.match(scout, /user-directed image-region capture still requires the actual supporting browser tool/i);
  assert.match(scout, /bounded, evidence-driven changed-strategy repair/i);
  assert.match(scout, /source, selector, query lane, or verified state preparation/i);
  assert.match(scout, /no admissible strategy remains/i);
  assert.match(scout, /Never call `send_message`/);
  assert.match(scout, /Run exactly `oh-my-design browser doctor --json` once/);
  assert.match(scout, /both `zones\[\]\.id` and `zones\[\]\.job`/);
  assert.match(scout, /actual rendered DOM and visible target group/i);
  assert.match(scout, /selectors verified against that inspection/i);
  assert.match(scout, /preset source URL, selector, repository, or fallback component/i);
  assert.match(scout, /`--from-user` is reserved for an actually supplied user URL/i);
  assert.match(scout, /required form, error, empty, or disclosure states/i);
  assert.match(scout, /requiredState\/falsifier/i);
  assert.doesNotMatch(scout, /designsystem\.digital\.gov|site-page-title|3x-haust\/oh-my-design/i);
  assert.match(scout, /Acquisition comes before exhaustive reading/);
  assert.match(scout, /host-required bootstrap read is permitted but is not operational research/);
  assert.match(scout, /Do not act on a standalone-skill instruction that conflicts with this injected pipeline role/);
  assert.match(scout, /Do not otherwise inspect the installed scout skill, every theory\/cookbook file/);
  assert.match(scout, /start `omd ref add-batch`/);
  const standaloneScout = read('src/skills/omd-scout/SKILL.md').replace(/\s+/g, ' ');
  assert.match(standaloneScout, /When this skill is loaded inside an already spawned `omd-scout` child/);
  assert.match(standaloneScout, /immediately execute the injected role's first operational pass/);
  assert.match(scout, /source-free no-ship visual packet/i);
  assert.match(scout, /host-side fidelity gates may inspect bound capture pixels independently/i);
  assert.match(scout, /Never claim image-to-code fidelity from a raw capture as a Hand input/i);
  assert.match(scout, /`omd ref board --input <candidate-assemblies\.json>`/);
  assert.match(scout, /If the route selects `reference-board`, run `omd schema reference-board` once/);
  assert.match(scout, /exactly `grid: \{column,span,order\}`/);
  assert.match(scout, /never CSS-grid fields such as `columns`, `rows`, or `gap`/);
  assert.match(scout, /requires every candidate to cover every required acquisition zone/);
  assert.match(scout, /If it returns `REF-PRINCIPLE-UNSAFE`, rewrite the same observed rule/);
  assert.match(scout, /This wording repair is not a capture repair batch/);
  assert.match(scout, /Never continue to board authoring after a failed principle command/);
  const batch = read('core/ref/batch.ts');
  assert.match(batch, /slot\?: string/);
  assert.match(batch, /spec\.slot \? \{ slot: spec\.slot \}/);
});

test('reference protocol and Scout share the bounded unavailable-provider fallback', () => {
  const protocol = read('core/protocol/reference-assembly.md').replace(/\s+/g, ' ');
  const scout = read('src/agents/scout.agent.yaml').replace(/\s+/g, ' ');
  for (const source of [protocol, scout]) {
    assert.match(source, /not callable on the current host\/connection/i);
    assert.match(source, /ordinary component inspection/i);
    assert.match(source, /user-directed image-region capture still requires the actual supporting browser tool/i);
    assert.match(source, /transient failure/i);
    assert.match(source, /never invent a manual region-capture CLI/i);
  }
  assert.doesNotMatch(protocol, /fallback only when browser-rs is unavailable for this platform/i);
  assert.match(protocol, /installed healthy binary does not prove an exposed tool/i);
});

test('framer CLI writes its owned frame and acquisition plan without direct file tools', () => {
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(framer, /Bash\(omd frame:\*\).*Bash\(omd acquisition:\*\).*deny: \[\]/);
  assert.match(framer, /those CLI mutations are required work, not forbidden direct source editing/);
  assert.match(framer, /Never use a patch or file-write tool/);
});

test('host model inheritance is default and role overrides are invocation-bound', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /The session model belongs to the user/);
  assert.match(skill, /Codex child launches omit `model`/);
  assert.match(skill, /Claude agents use `model: inherit`/);
  assert.match(skill, /Only the broker applies the user's outer-invocation `--omd-role-model` \/ `--omd-role-effort` overrides/);
  assert.match(skill, /`modelArgumentOmitted: false`; this alone is not model drift/);
  assert.match(skill, /Never invent an override or replace host settings/);
  assert.match(skill, /retain its real child\/process handle, wait and gate completion/);

  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Model ownership belongs to the user/);
  assert.match(loop, /Codex child launches omit `model` and may pass only `reasoning_effort`/);
  assert.match(loop, /Claude agent metadata uses `model: inherit` and the role's `effort`/);
  assert.match(loop, /user's explicit outer-invocation `--omd-role-model` \/ `--omd-role-effort`/);
  assert.match(loop, /Without that explicit invocation override, a user-selected Luna run remains Luna/);

  const agents = read('AGENTS.md').replace(/\s+/g, ' ');
  assert.match(agents, /the user chooses the model and any invocation override/);
  assert.match(agents, /Without an explicit host override, a Luna session keeps Luna for every OMD child and a Sol session keeps Sol/);
  assert.match(agents, /--omd-role-model role=model/);
  assert.match(agents, /--omd-role-effort role=low\|medium\|high/);
  assert.match(agents, /A coordinator, role task, or installed agent profile must not invent an override/);
  assert.doesNotMatch(agents, /Sol \\(recommended\\)|Terra xhigh \\(recommended\\)|Luna high \\(recommended\\)/);
});

test('codex named roles never combine agent type with a full-history fork', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /Never combine a named `agent_type` with a full-history fork/i);
  assert.match(skill, /fresh role-bounded prompt/i);
});

test('the coordinator cannot claim completion without a current immutable final pointer', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  assert.match(skill, /run `omd completion preflight --activation "\$OMD_ACTIVATION_PATH"`/);
  assert.match(skill, /MUST NOT say (?:the work|it) is complete/i);
  assert.match(skill, /final-evidence-v2\.json/);
  assert.match(skill, /report the exact host-authority blocker/i);
  assert.match(skill, /never substitute\s+app tests, build output, screenshots, probes, or reviewer prose/i);
});

test('register comparison guidance separates upstream concepts and preserves host and motion authority', () => {
  const adr = read('core/protocol/adr/marketing-motion-decision.md').replace(/\s+/g, ' ');
  const protocol = read('core/protocol/design-deliberation.md').replace(/\s+/g, ' ');
  const skeleton = INPUT_SKELETONS.find(input => input.name === 'art-direction-check')!;
  assert.equal(skeleton.command, 'omd art-direction check --input .omd/.cache/art-direction-check.json --json');
  assert.match(adr, /two or three distinct supported registers/);
  assert.match(adr, /exactly one evidence-backed rejection for every nonwinner/);
  assert.match(adr, /distinct concepts in the same register/);
  assert.match(adr, /representative for a register only after the visible concept comparison/);
  assert.match(adr, /singleton requires a matching current explicit user register lock/);
  assert.match(adr, /Visible-evidence-only canonical singletons remain unsupported/);
  assert.match(adr, /restrained and more-expressive realizations of that same concept while preserving its content-to-form invariants/);
  assert.match(adr, /register studies, not evidence of distinct concept inventions/);
  assert.match(adr, /neither a supported second register nor an explicit register lock exists[^.]*do not invent evidence/);
  assert.match(protocol, /explicit current-user register lock is binding input, not a new fork requiring invented alternatives/);
  assert.match(protocol, /command does not issue its own authority/);
  assert.match(protocol, /Missing host publication authority blocks this publication path/);
  assert.doesNotMatch(protocol, /local-check/);
  assert.match(skeleton.constraints!.join(' '), /none rejects all pending slots[^;]*; slots:\[\] is valid only when no pending slots exist/);
  const result = (skeleton.skeleton as { evaluatorResult: { motionResolution: { slots: unknown[] } } }).evaluatorResult;
  assert.equal(result.motionResolution.slots.length, 1, 'the printed placeholder must not prescribe empty settlement');
});

test('deep deliberation detail stays externalized behind stage contracts', () => {
  const protocol = read('core/protocol/design-deliberation.md').replace(/\s+/g, ' ');
  assert.match(protocol, /OMD does not request, store, or grade hidden chain-of-thought/);
  assert.match(protocol, /A landing page with a new art direction is L4/);
  assert.match(protocol, /spawn three fresh `omd-eye` agents concurrently/);
  assert.match(protocol, /before render → observable fact → judgment → exact change → distinct after render → measured result/);
  assert.match(protocol, /zone job → captured reference identity → extracted principle → composition decision ID/);
  assert.match(protocol, /`omd art-direction check` publishes through the current host-issued invocation/);
  assert.match(protocol, /moderator-authored deliberation record and evaluator payloads are separate from host authority/);
  assert.match(protocol, /check-input --input <alternatives.json> --json/);
  assert.match(protocol, /does not fall back to an inline invocation on failure/);
  assert.match(protocol, /The eye is intentionally read-only/);

  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  assert.match(skill, /Use `\.omd\/route\.json` as the machine-consumed strategy/);
  assert.match(skill, /§Evidence handoff/);
  assert.match(read('core/protocol/human-design-loop.md'), /delivered contracts/);
  assert.match(skill, /omd stage resume/);
  assert.match(skill, /omd stage deliver --stage <stage> --contract <pack-relative-path>/);
  assert.match(skill, /File\/symbol cues come from `omd cue`/);

  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(framer, /You also own `\.omd\/acquisition-plan\.json`/);
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /You own `\.omd\/observations\/\*\.json`/);
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /In L4 perspective mode/);
});
