# Oh My Design

[![CI](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml/badge.svg)](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%403xhaust%2Foh-my-design)](https://www.npmjs.com/package/@3xhaust/oh-my-design)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**사람처럼 디자인하는 AI.** 하나의 완전한 요청을 주면 OMD가 프로젝트를 살펴보고, 필요한
레퍼런스를 조사하고, 방향을 선택하고, 구현·렌더·수정·검증을 하나의 모델 주도 흐름으로
완료합니다.

[English](README.md)

## 하나의 진입점

모든 디자인 작업은 `/ultradesign`으로 시작합니다. 원래 요청, 사용자가 고른 모델, 기존 스택,
허용된 쓰기 범위를 보존합니다.

| 진입점 | 용도 |
| --- | --- |
| `/ultradesign` (`omd-ultradesign`) | 새 제품, 기존 프로젝트의 기능·리디자인·수정, Figma 타깃, 사용자가 준 이미지·URL, 레퍼런스 조사, 구현, 비평, 검증된 완료 |

내부 리뷰 에이전트는 하나입니다.

| 에이전트 | 목적 | 접근 |
| --- | --- | --- |
| `omd-eye` | 패킷에 결속된 독립 시각·충실도·결과·텍스트 리뷰 | 읽기 전용 |

## 모델 주도 기본 경로

일반 경로는 직접적이며 근거 중심입니다.

1. 요청, 저장소, 스택, 라우트, 컴포넌트, 콘텐츠, 현재 렌더를 확인합니다.
2. 기존/한정 작업은 `route-input`, 새 제품은 `product-route-input`을 검증·분류합니다.
3. `omd stage next --json`으로 현재 모델 주도 작업을 확인합니다.
4. 중요한 결정을 바꿀 수 있을 때 과업에 맞는 레퍼런스를 조사합니다.
5. `omd guard production --json`을 실행한 뒤 선언된 범위 안에서 구현합니다.
6. 데스크톱, 모바일, 긴 콘텐츠, 요청된 상호작용 상태를 렌더하고 직접 확인합니다.
7. `omd first-render check --page <entry> --json`을 실행하고 관찰된 결함을 수정합니다.
8. 실제 컨트롤에서 결과별 trusted lifecycle manifest 하나를 작성합니다.
9. `omd lifecycle finish --json`으로 패키지 검사, 브라우저 평가, 독립 리뷰, source seal,
   최종 발행을 함께 완료합니다.

선택하지 않은 방법에는 역할 릴레이, 후보 토너먼트, 생략 문서, 중간 디자인 산출물이 필요하지
않습니다. 동작·접근성·안전·소스 소유권·근거 정직성·독립 리뷰는 계속 필수입니다.

## 레퍼런스와 Figma

외부 원본은 비교 자료이며 제품 자산이나 승인이 아닙니다. 전체 이미지를 보존하고
`omd ref context`로 요청 범위의 primary 원본 하나를 기록한 뒤, 실제 데스크톱/모바일 결과의
구성·위계·밀도·타이포·컨트롤 크래프트를 비교합니다. hover, focus, pressed, open 상태는 안전한
prepared capture를 사용하고 제품 쪽의 같은 상태를 `captureState`로 결속합니다. 제출·로그인·
결제·다운로드·삭제·페이지 이동 동작은 거부합니다.

요청 안의 Figma `/file/` 또는 `/design/` URL은 구현 타깃입니다.

```bash
omd figma pull <file-url>
omd figma system
omd figma diff <frame-id> <page-or-url> --json
```

완료에는 현재 snapshot과 현재 통과한 frame diff 기록이 필요합니다. Figma 타깃 작업에는 별도의
consulted-primary 기록을 요구하지 않습니다.

## 설치

### npm

```bash
npm install -g @3xhaust/oh-my-design
oh-my-design install
oh-my-design doctor
omd doctor
```

npm의 스코프 없는 `oh-my-design`은 다른 프로젝트입니다. `oh-my-design uninstall`은 호스트 설치만
되돌리고 프로젝트의 `.omd/` 기록은 지우지 않습니다.

### Pi 호환 호스트

```bash
pi install npm:@3xhaust/oh-my-design
```

Pi와 호환 fork는 공개 extension API를 통해 같은 extension과 정본 skill을 로드합니다.
Extension은 프로젝트 상태 확인용 `/omd`와 구조화된 CLI 호출용 `omd_cli`를 등록합니다.

### Claude Code 마켓플레이스

```text
/plugin marketplace add 3x-haust/oh-my-design
/plugin install oh-my-design@omd
```

이후 `/ultradesign`을 실행합니다.

### 소스에서 설치

```bash
git clone https://github.com/3x-haust/oh-my-design
cd oh-my-design
npm install
node bin/omd-install.ts install
node bin/omd.ts doctor
```

## 브라우저 지원

OMD는 지원되는 Darwin arm64와 Linux x64에서 검증된 `browser-rs`를 우선 사용합니다.
Playwright + Chromium은 렌더·측정·프로브·브라우저 평가의 결정적 폴백입니다.

```bash
npx playwright install chromium
omd doctor
```

## 공개 CLI

공개 CLI는 과거의 구조화 워크플로보다 의도적으로 작습니다.

| 그룹 | 공개 명령 |
| --- | --- |
| 진입·상태 | `--version`, `help`, `doctor`, `usage` |
| 워크플로·검증 | `lifecycle`, `route`, `schema`, `stage`, `guard`, `first-render`, `check` |
| 레퍼런스·디자인 입력 | `ref`, `language`, `feedback`, `locale`, `ai-judgment`, `figma`, `target`, `pack` |
| 렌더·근거 | `render`, `probe`, `measure`, `lighthouse`, `browser` |
| 품질·학습 | `slop`, `coach`, `learn` |
| 유틸리티 | `hash` |

유지되는 워크플로 하위 명령:

```text
omd lifecycle help|verify|finish
omd route starter|validate|classify|show|check
omd schema list | omd schema <allowlisted-name>
omd stage next
omd guard production|completion
omd first-render check|review
```

레퍼런스 하위 명령:

```text
browse, tidy, context, navigate, control-observe, cookie-control,
discover-plan, discover-batch, work-next, advance, exclude,
research-set, research-check, search, leads,
direction-review, add, add-batch, list, show, principles, audit, import-image
```

전체 dispatcher 문법은 `omd help`에서 확인합니다.

## 근거 경계

- 브라우저 동작은 실제 실행·캡처한 범위만 증명합니다.
- 결정적 검사는 이름이 붙은 규칙만 확인하며 시각 품질을 인증하지 않습니다.
- `omd-eye`는 독립 모델 판단을 제공하지만 사람 승인이나 사람 평점은 아닙니다.
- Figma diff와 레퍼런스 비교는 현재 픽셀 관계를 증명하며 사용성을 인증하지 않습니다.
- 계정·결제·삭제 등 외부 변경 권한은 별도입니다.
- 완료는 현재 소스, 브라우저 근거, 독립 리뷰, 최종 발행이 같은 요청과 빌드에 결속될 때만
  유효합니다.

`.omd/`에는 라우트, 레퍼런스 문맥, Figma 기록, 브라우저 영수증, 관찰, 리뷰 계보, source seal,
최종 근거가 저장됩니다. 재생성 가능한 임시 자료는 `.omd/.cache/`에 둡니다.

## 아키텍처

프롬프트 정본:

- `src/skills/omd-ultradesign/SKILL.md`
- `src/agents/eye.agent.yaml`

생성 결과 - 직접 수정하지 않습니다:

- `skills/`
- `agents/`
- `dist/`

`npm run build`가 이를 재생성하고 `omd pack`이 사용하는 내부 `core/guides/*.md`를 복사합니다.

## 개발

저장소 변경의 완료 조건:

```bash
npx tsc --noEmit
npm run build
npm test
```

커밋은 conventional prefix를 사용합니다. 릴리스와 버전 변경은 명시적으로 요청받았을 때만 합니다.
