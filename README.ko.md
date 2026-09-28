<div align="center">

# Oh My Design

**사람처럼 디자인하는 AI: 실제 사례를 조사하고, 방향을 고르고, 구현한 뒤 브라우저에 보이는 결과를 확인합니다.**

[![CI](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml/badge.svg)](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%403xhaust%2Foh-my-design)](https://www.npmjs.com/package/@3xhaust/oh-my-design)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[시작하기](#30초-설치) · [작동 방식](#작동-방식) · [English](README.md)

</div>

## 실제 결과 보기

<!-- OWNER TODO: 승인된 실제 OMD 데모 GIF 또는 전후 비교 스크린샷으로 이 자리를 교체하세요. 평가용 fixture 이미지를 제품 데모로 사용하지 마세요. -->
> **데모 이미지는 준비 중입니다.** 그동안 [OMD로 원샷 프롬프트에서 만든 랜딩 페이지](https://3x-haust.github.io/oh-my-design/)를 확인하세요. 시각적 결과물은 수동으로 다듬지 않았습니다.

## 30초 설치

**Pi** (또는 공개 Pi extension/package API를 지원하는 호스트):

```bash
pi install npm:@3xhaust/oh-my-design
```

Pi에서 프로젝트를 열고 `/omd`로 설치 상태를 확인하세요. 디자인 작업에는 에이전트에게 `omd-ultradesign` 스킬을 사용하라고 요청하세요. 호환 fork에서는 해당 호스트의 패키지 설치 명령에 같은 npm 패키지를 전달합니다.

**Codex 또는 Claude Code** (Node.js 22.19 이상, npm 필요):

```bash
npm install -g @3xhaust/oh-my-design
oh-my-design install --host codex   # Claude Code는 --host claude 사용
oh-my-design doctor --host codex    # Claude Code는 --host claude 사용
```

선택한 호스트에서 세션을 열고 `/ultradesign`을 실행하세요. Claude Code는 [플러그인 마켓플레이스](.claude-plugin/marketplace.json)에서도 설치할 수 있습니다: `/plugin marketplace add 3x-haust/oh-my-design` 다음 `/plugin install oh-my-design@omd`. 반드시 **스코프가 붙은** npm 패키지를 사용하세요. 스코프 없는 `oh-my-design`은 다른 프로젝트입니다. 브라우저 검증에는 Chromium이 필요합니다. `omd doctor`에서 누락을 보고하면 `npx playwright install chromium` 실행 후 다시 확인하세요.

## 무엇이 다른가요?

화면만 생성하는 에이전트와 달리 OMD는 *화면을 만든 판단*을 검토할 수 있게 합니다.

- **실제 레퍼런스 조사.** 유사 서비스와 시각 디자인의 근거를 구분해 기록합니다. 선택한 사례에서 원칙을 가져오되 스크린샷이나 원본 픽셀을 복사하지 않습니다. [레퍼런스 규약](core/protocol/reference-assembly.md)
- **구현 전에 방향 결정.** 과제를 정의하고 콘셉트와 대표 렌더를 탐색한 뒤 선택한 방향을 구현합니다. 모든 단계를 강제하지 않고 적용되지 않는 작업은 이유를 기록하고 건너뜁니다. [디자인 실행 규약](core/protocol/design-practice.md)
- **브라우저에서 결과 검증.** 데스크톱·모바일 렌더, 로컬 상호작용 프로브와 독립 리뷰로 코드만 봐서는 알 수 없는 문제를 찾습니다. 검사는 동작과 근거를 측정하지, 인간 수준의 디자인 품질을 인증하지 않습니다. [시각 측정](core/protocol/visual-measurement.md)
- **AI스러운 결과를 다시 보는 루프.** 카피, 타이포그래피, 위계, 상투적인 패턴을 따로 살피고 확인된 문제는 수정 후 실제 렌더에서 다시 확인합니다. 경고는 판단할 후보일 뿐 AI 제작 여부의 판별기가 아닙니다. [Slop 리뷰](core/protocol/slop-review.md)

<!-- TODO after fix/reference-research merges: 병합된 구현을 확인한 뒤에만 레퍼런스 조사 관련 설명을 갱신하세요. -->

## 작동 방식

```text
요청 → 과제 정의 → 조사·방향 탐색 → 방향 선택
     → 구현 → 브라우저 렌더·프로브 → 비평 → 수정 또는 재정의
```

모든 프로젝트에 같은 단계를 적용한다는 뜻이 아닌 **판단 루프**입니다. 검토 가능한 결정과 근거는 프로젝트의 `.omd/`에, 임시 렌더는 `.omd/.cache/`에 남깁니다. [전체 워크플로](core/protocol/human-design-loop.md)

## 주요 기능

| 기능 | 하는 일 |
| --- | --- |
| `omd-ultradesign` | 과제 정의부터 렌더 리뷰까지 디자인·구현 작업을 조율합니다. |
| `omd-figma` | Figma 원본을 바탕으로 구현하고 충실도를 측정합니다. |
| `omd-scout` | 구현 없이 레퍼런스 근거와 컴포넌트별 방향을 수집합니다. |
| `omd-critique` | 기존 디자인을 수정하지 않고 리뷰합니다. |
| `omd-humanize` | 검증된 사실을 유지하면서 문장을 다듬습니다. |
| `omd-coach` | 검사 이력을 바탕으로 연습할 부분을 제안합니다. |
| `omd` CLI | 로컬 doctor, 레퍼런스, 렌더, 프로브, 디자인 검사를 실행합니다. |

스킬 원본은 [`src/skills/`](src/skills/), 디자인 규약과 구현 상세는 [`core/protocol/`](core/protocol/)에 있습니다.

## 지원 호스트

| 호스트 | 설치 | 시작 |
| --- | --- | --- |
| Pi | `pi install npm:@3xhaust/oh-my-design` | `/omd`로 상태 확인, `omd-ultradesign` 스킬로 작업 |
| Pi 호환 호스트 | 해당 호스트의 패키지 설치 명령에 동일한 npm 패키지 전달 | 공개 Pi extension API 사용, 호스트 전용 API 불필요 |
| Codex | 전역 npm 패키지 + `oh-my-design install --host codex` | `/ultradesign` |
| Claude Code | 전역 npm 패키지 + `oh-my-design install --host claude` 또는 플러그인 마켓플레이스 | `/ultradesign` |

## 자주 묻는 질문

**브라우저가 필요한가요?** 렌더 검증에는 필요합니다. OMD는 재현 가능한 렌더·프로브에 Playwright + Chromium을 사용하고, 지원 플랫폼에서 정상 동작하는 browser-rs는 대화형 브라우저 작업에 우선 사용합니다. 문제가 생기면 `omd doctor`를 실행하세요.

**레퍼런스 사이트를 복사하나요?** 아니요. 관찰 내용과 적용하거나 피할 요소를 기록하고, 제작에는 원본과 분리된 디자인 방향을 전달합니다. 공개 레퍼런스라도 원본 픽셀을 재사용할 권리를 주지는 않습니다. [레퍼런스 규약](core/protocol/reference-assembly.md)

**좋은 디자인을 보장하나요?** 아니요. 검사와 브라우저 근거로 판단을 검토할 수 있지만, 시각적 완성도에는 여전히 맥락에 맞는 사람의 판단이 필요합니다.

**기존 프로젝트에서도 쓸 수 있나요?** 네. OMD는 고정 스캐폴드로 교체하지 않고 현재 스택과 기존 디자인을 살핍니다. [워크플로](core/protocol/human-design-loop.md)

## 기여 및 라이선스

설치, 테스트 분류, PR 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요. 이슈와 범위가 명확한 PR을 환영합니다. [MIT 라이선스](LICENSE)를 따릅니다.
