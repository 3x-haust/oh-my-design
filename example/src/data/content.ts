// English copy is used verbatim from .omd/copy-deck.md — no paraphrase, no rewrite.
// Korean copy translates the same claims using the terminology already
// established in the repo's own README.ko.md (브리프/근거/카피/구성 계약/
// 격리된 구조안/프로덕션 구현/렌더 비평/재정의), not a fresh voice.

export type Locale = "en" | "ko";

export type StageState = "checked" | "current" | "pending";

export interface Stage {
  num: string;
  title: string;
  body: string;
  artifact: string;
}

// All nine start "pending" in markup; StageState is computed at runtime by
// scroll position and never more than one stage is "checked" simultaneously
// past the current one (domain grammar: pending -> current -> checked).
const stagesEn: Stage[] = [
  {
    num: "01",
    title: "Brief",
    body: "Records the problem and the evidence behind it; every claim needs a user sentence, research line, datum, or named observation.",
    artifact: ".omd/frame.md",
  },
  {
    num: "02",
    title: "Evidence",
    body: "Gathers measurements and principles from real references, not screenshots to copy.",
    artifact: ".omd/refs/*.json",
  },
  {
    num: "03",
    title: "Copy",
    body: "Writes the fact-traceable words first; every shipped claim points to a verified fact ID.",
    artifact: ".omd/copy-deck.md",
  },
  {
    num: "04",
    title: "Typography proof",
    body: "Proves the real copy at actual size before any layout exists.",
    artifact: ".omd/type-proof.md",
  },
  {
    num: "05",
    title: "Composition contract",
    body: "Fixes the focal point and CTA path before structures are drawn.",
    artifact: ".omd/composition.md",
  },
  {
    num: "06",
    title: "Isolated structure",
    body: "Builds separate candidate layouts from the same contract.",
    artifact: ".omd/.cache/sketches/",
  },
  {
    num: "07",
    title: "One production build",
    body: "Ships exactly one of those candidates as real, working source.",
    artifact: "repository source",
  },
  {
    num: "08",
    title: "Rendered critique",
    body: "A reviewer judges only the rendered result, never the builder's reasoning.",
    artifact: "cache renders, filmstrip",
  },
  {
    num: "09",
    title: "Reframe",
    body: "Appends what the render revealed to the original brief instead of erasing it.",
    artifact: ".omd/frame.md revision",
  },
];

const stagesKo: Stage[] = [
  {
    num: "01",
    title: "브리프",
    body: "문제와 그 근거를 기록합니다. 모든 주장에는 사용자 문장, 조사 문장, 데이터, 이름을 밝힌 관찰 중 하나가 필요합니다.",
    artifact: ".omd/frame.md",
  },
  {
    num: "02",
    title: "근거",
    body: "베낄 화면이 아니라 실제 레퍼런스에서 측정값과 원리를 모읍니다.",
    artifact: ".omd/refs/*.json",
  },
  {
    num: "03",
    title: "카피",
    body: "레이아웃보다 먼저 사실 근거를 추적할 수 있는 문구를 씁니다. 실제로 나가는 모든 주장은 검증된 팩트 ID를 가리킵니다.",
    artifact: ".omd/copy-deck.md",
  },
  {
    num: "04",
    title: "타이포그래피 proof",
    body: "레이아웃이 생기기 전에 실제 카피를 실제 크기로 증명합니다.",
    artifact: ".omd/type-proof.md",
  },
  {
    num: "05",
    title: "구성 계약",
    body: "구조를 그리기 전에 focal point와 CTA 경로를 고정합니다.",
    artifact: ".omd/composition.md",
  },
  {
    num: "06",
    title: "격리된 구조안",
    body: "같은 계약에서 서로 볼 수 없는 후보 레이아웃을 만듭니다.",
    artifact: ".omd/.cache/sketches/",
  },
  {
    num: "07",
    title: "프로덕션 구현 1회",
    body: "그 후보들 중 하나만 실제로 동작하는 소스로 구현합니다.",
    artifact: "repository source",
  },
  {
    num: "08",
    title: "렌더 비평",
    body: "리뷰어는 구현자의 의도가 아니라 렌더 결과만 보고 판단합니다.",
    artifact: "cache renders, filmstrip",
  },
  {
    num: "09",
    title: "재정의",
    body: "렌더가 드러낸 내용을 원래 브리프에 덧붙입니다. 지우지 않습니다.",
    artifact: ".omd/frame.md revision",
  },
];

export interface EvidenceRow {
  stage: string;
  artifact: string;
  boundary: string;
}

const evidenceRowsEn: EvidenceRow[] = [
  {
    stage: "Frame",
    artifact: ".omd/frame.md",
    boundary: "Claims need a user sentence, research line, datum, or named observation.",
  },
  {
    stage: "Research",
    artifact: ".omd/refs/*.json",
    boundary: "Builders receive measurements and principles, not screenshots to imitate.",
  },
  {
    stage: "Copy",
    artifact: ".omd/copy-deck.md",
    boundary: "Each shipped factual claim points to a verified fact ID.",
  },
  {
    stage: "Blind copy review",
    artifact: "review handoff",
    boundary: "The reviewer cannot inspect renders, source, layout, frame, decisions, or authorship.",
  },
  {
    stage: "Typography proof",
    artifact: ".omd/type-proof.md",
    boundary: "Actual target-language copy proves roles, glyph coverage, and fallback at real viewports.",
  },
  {
    stage: "Composition contract",
    artifact: ".omd/composition.md",
    boundary: "A clean-room composer defines the focal anchor and CTA path from sanitized evidence alone.",
  },
  {
    stage: "Blind choice",
    artifact: ".omd/taste/preferences.jsonl",
    boundary: "The selector sees anonymous renders and sanitized task context, not candidate rationale.",
  },
  {
    stage: "Production build",
    artifact: "repository source",
    boundary: "One builder implements one selected structure and preserves the copy deck.",
  },
  {
    stage: "Rendered review",
    artifact: "cache renders, filmstrip",
    boundary: "The reviewer sees measured outputs, never the builder's rationale.",
  },
  {
    stage: "Reframe",
    artifact: ".omd/frame.md revision",
    boundary: "Appends what the render revealed instead of erasing the original framing.",
  },
];

const evidenceRowsKo: EvidenceRow[] = [
  {
    stage: "프레임",
    artifact: ".omd/frame.md",
    boundary: "주장에는 사용자 문장, 조사 문장, 데이터, 이름을 밝힌 관찰 중 하나가 근거로 필요합니다.",
  },
  {
    stage: "리서치",
    artifact: ".omd/refs/*.json",
    boundary: "구현 담당자는 베낄 화면 대신 측정값과 원리를 받습니다.",
  },
  {
    stage: "카피",
    artifact: ".omd/copy-deck.md",
    boundary: "실제로 나가는 사실 문구는 모두 검증된 팩트 ID를 참조합니다.",
  },
  {
    stage: "블라인드 카피 리뷰",
    artifact: "review handoff",
    boundary: "리뷰어는 렌더, 소스, 레이아웃, frame, decisions, 작성자를 볼 수 없습니다.",
  },
  {
    stage: "타이포그래피 proof",
    artifact: ".omd/type-proof.md",
    boundary: "실제 언어의 카피가 역할, 글리프 범위, fallback을 실제 viewport에서 증명합니다.",
  },
  {
    stage: "구성 계약",
    artifact: ".omd/composition.md",
    boundary: "clean-room composer가 정제된 근거만으로 focal anchor와 CTA 경로를 정합니다.",
  },
  {
    stage: "블라인드 선택",
    artifact: ".omd/taste/preferences.jsonl",
    boundary: "선택 담당자는 익명 렌더와 정제된 과업 맥락만 보고, 후보의 이유는 보지 않습니다.",
  },
  {
    stage: "프로덕션 구현",
    artifact: "repository source",
    boundary: "구현 담당자 한 명이 선택한 구조 하나를 구현하고 카피 덱을 보존합니다.",
  },
  {
    stage: "렌더 리뷰",
    artifact: "cache renders, filmstrip",
    boundary: "리뷰어는 측정된 결과만 보고, 구현자의 이유는 보지 않습니다.",
  },
  {
    stage: "재정의",
    artifact: ".omd/frame.md revision",
    boundary: "렌더가 드러낸 내용을 덧붙입니다. 원래 프레임을 지우지 않습니다.",
  },
];

export interface Skill {
  name: string;
  body: string;
}

const skillsEn: Skill[] = [
  {
    name: "omd-ultradesign",
    body: "Run the complete human design loop for a page, app, dashboard, blog, landing page, or redesign.",
  },
  {
    name: "omd-figma",
    body: "Pull a Figma file, synthesize its system, implement frames, compare responsive pairs, and report measured fidelity.",
  },
  {
    name: "omd-scout",
    body: "Build a standalone measured reference board without designing or implementing.",
  },
  {
    name: "omd-critique",
    body: "Review an existing design without changing it; group deterministic findings by root cause and judge rendered craft.",
  },
  {
    name: "omd-humanize",
    body: "Preserve facts while locally repairing sound discourse or reconstructing a misshapen message from verified facts, voice, and surface action.",
  },
  {
    name: "omd-coach",
    body: "Read accumulated check history, identify recurring problems and trends, and suggest what to practise next.",
  },
];

const skillsKo: Skill[] = [
  {
    name: "omd-ultradesign",
    body: "페이지, 앱, 대시보드, 블로그, 랜딩 페이지, 리디자인에 전체 사람 디자인 루프를 실행합니다.",
  },
  {
    name: "omd-figma",
    body: "Figma 파일을 가져와 시스템을 추출하고, 프레임과 반응형 쌍을 구현한 뒤 측정한 충실도를 보고합니다.",
  },
  {
    name: "omd-scout",
    body: "디자인이나 구현 없이 독립적인 측정 레퍼런스 보드를 만듭니다.",
  },
  {
    name: "omd-critique",
    body: "기존 디자인을 고치지 않고 리뷰합니다. 검사 결과를 원인별로 묶고 렌더 완성도를 판단합니다.",
  },
  {
    name: "omd-humanize",
    body: "사실을 보존하면서 구조가 맞는 글은 국소 수리하고, 담화 구조가 망가진 글은 검증된 사실·보이스·실제 행동에서 재구성합니다.",
  },
  {
    name: "omd-coach",
    body: "누적된 check history에서 반복 문제와 추세를 읽고 다음 연습 항목을 제안합니다.",
  },
];

export interface LocaleContent {
  stages: Stage[];
  evidenceRows: EvidenceRow[];
  skills: Skill[];
}

export function getContent(locale: Locale): LocaleContent {
  return locale === "ko"
    ? { stages: stagesKo, evidenceRows: evidenceRowsKo, skills: skillsKo }
    : { stages: stagesEn, evidenceRows: evidenceRowsEn, skills: skillsEn };
}
