import type { Locale } from "./content";

export interface Copy {
  nav: {
    loop: string;
    evidence: string;
    skills: string;
    install: string;
    langLabel: string;
    langHref: string;
  };
  hero: {
    title: string;
    body: string;
    ctaPrefix: string;
  };
  loop: {
    heading: string;
    current: string;
    checked: string;
    pending: string;
    inlineCaption: string;
  };
  evidence: {
    heading: string;
    colStage: string;
    colArtifact: string;
    colBoundary: string;
  };
  skills: {
    heading: string;
  };
  install: {
    heading: string;
    requires: string;
    copyLabel: string;
    copiedLabel: string;
    copyErrorLabel: string;
    copyAriaLabel: string;
    copySuccessStatus: string;
    copyErrorStatus: string;
    fineHostDoctor: string;
    fineRuntimeDoctor: string;
  };
  footer: {
    heading: string;
    body: string;
    sourceLink: string;
    langLink: string;
    langHref: string;
  };
}

const en: Copy = {
  nav: {
    loop: "Loop",
    evidence: "Evidence",
    skills: "Skills",
    install: "Install OMD",
    langLabel: "한국어",
    langHref: `${import.meta.env.BASE_URL}ko/`,
  },
  hero: {
    title: "A design process for coding agents. Not a visual style.",
    body: "OMD stops a coding agent from jumping straight from a request to polished UI. It questions the brief, gathers evidence, writes real copy, compares structures, builds once, inspects the render, and reframes. Every decision along that chain is recorded, not asserted.",
    ctaPrefix: "Install OMD — ",
  },
  loop: {
    heading: "Nine stages. Each one checked before the next begins.",
    current: "current",
    checked: "checked",
    pending: "pending",
    inlineCaption: "pinned on desktop — attached here on mobile",
  },
  evidence: {
    heading: "What gets checked, and who is blind to what",
    colStage: "Stage",
    colArtifact: "Artifact",
    colBoundary: "Boundary",
  },
  skills: {
    heading: "Six skills. Each one a different entry point.",
  },
  install: {
    heading: "Install, then verify.",
    requires: "Requires Node.js 22.18 or newer, and Codex, Claude Code, or both, already configured.",
    copyLabel: "Copy",
    copiedLabel: "Copied",
    copyErrorLabel: "Select manually",
    copyAriaLabel: "Copy install commands to clipboard",
    copySuccessStatus: "Commands copied to clipboard.",
    copyErrorStatus:
      "Clipboard access was blocked by the browser. Select the text in the code block above and copy it manually.",
    fineHostDoctor: "verifies the host installation.",
    fineRuntimeDoctor: "checks the runtime, Chromium availability, project write access, and the bundled theory pack.",
  },
  footer: {
    heading: "Run the loop yourself.",
    body: "MIT licensed. Read the full process in the README, in English or 한국어.",
    sourceLink: "View source on GitHub",
    langLink: "한국어로 보기 (View in Korean)",
    langHref: `${import.meta.env.BASE_URL}ko/`,
  },
};

const ko: Copy = {
  nav: {
    loop: "루프",
    evidence: "근거",
    skills: "스킬",
    install: "OMD 설치",
    langLabel: "English",
    langHref: import.meta.env.BASE_URL,
  },
  hero: {
    title: "비주얼 스타일이 아니라, 코딩 에이전트를 위한 디자인 프로세스입니다.",
    body: "OMD는 코딩 에이전트가 요청을 받자마자 완성 화면으로 뛰어드는 흐름을 막습니다. 브리프를 캐묻고, 근거를 모으고, 실제 카피를 쓰고, 구조를 비교하고, 한 번 구현하고, 렌더를 살핀 뒤 다시 정의합니다. 그 과정의 모든 결정은 주장이 아니라 기록됩니다.",
    ctaPrefix: "OMD 설치 — ",
  },
  loop: {
    heading: "아홉 단계. 다음 단계는 이전 단계가 확인된 뒤에만 시작됩니다.",
    current: "진행 중",
    checked: "완료",
    pending: "대기",
    inlineCaption: "데스크톱에서는 고정 카드, 모바일에서는 이 위치에 붙습니다",
  },
  evidence: {
    heading: "무엇을 검사하고, 누가 무엇을 못 보는가",
    colStage: "단계",
    colArtifact: "산출물",
    colBoundary: "경계",
  },
  skills: {
    heading: "여섯 개의 스킬. 각각 다른 진입점입니다.",
  },
  install: {
    heading: "설치하고 검증하세요.",
    requires: "Node.js 22.18 이상, 그리고 Codex 또는 Claude Code(또는 둘 다)가 이미 설정되어 있어야 합니다.",
    copyLabel: "복사",
    copiedLabel: "복사됨",
    copyErrorLabel: "직접 선택하세요",
    copyAriaLabel: "설치 명령어를 클립보드에 복사",
    copySuccessStatus: "명령어가 클립보드에 복사되었습니다.",
    copyErrorStatus: "브라우저가 클립보드 접근을 차단했습니다. 위 코드 블록의 텍스트를 직접 선택해서 복사하세요.",
    fineHostDoctor: "는 호스트 설치를 검증합니다.",
    fineRuntimeDoctor: "는 런타임, Chromium 존재 여부, 프로젝트 쓰기 권한, 내장 이론 팩을 확인합니다.",
  },
  footer: {
    heading: "직접 루프를 실행해 보세요.",
    body: "MIT 라이선스입니다. 전체 프로세스는 README에서 영어 또는 한국어로 읽을 수 있습니다.",
    sourceLink: "GitHub에서 소스 보기",
    langLink: "View in English (영어로 보기)",
    langHref: import.meta.env.BASE_URL,
  },
};

export function getCopy(locale: Locale): Copy {
  return locale === "ko" ? ko : en;
}
