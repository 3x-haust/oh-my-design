# Oh My Design

브리프를 묻고, 근거를 모으고, 실제 문구와 구조를 따로 검토한 뒤, 한 번 구현하고 렌더를 보고 다시 정의합니다.

[English](README.md)

## ‘사람처럼 디자인한다’는 뜻

여기서 ‘사람처럼’은 특정한 결과 스타일이 아니라 근거를 남기는 판단 과정을 뜻합니다.

Oh My Design(OMD)은 요청을 받자마자 완성 화면으로 뛰어드는 흐름을 막습니다. 어떤 문제를 푸는지 먼저 묻고, 판단 근거를 기록하고, 글과 레이아웃을 분리합니다. 서로의 작업을 볼 수 없는 상태에서 구조를 비교하고, 구현자의 의도를 모르는 리뷰어가 실제 렌더를 비평합니다. 결과는 차분할 수도, 과감할 수도, 익숙하거나 낯설 수도 있습니다. 일관되는 것은 결과의 생김새가 아니라 결정의 흐름입니다.

전체 흐름은 다음과 같습니다.

```text
브리프 → 근거 → 카피 → 타이포그래피 proof → 격리된 구조안 → 프로덕션 구현 1회
       → 렌더 비평과 인터랙션 증거 → 문제 재정의
```

OMD는 Codex와 Claude Code에서 동작합니다. 사용자용 스킬 6개, 내부 파이프라인 에이전트 8개, 로컬 CLI, 디자인 이론·레시피 팩, `.omd/` 프로젝트 기록으로 구성됩니다.

## 빠른 시작

필요한 환경:

- Node.js 22.18 이상
- Codex, Claude Code 또는 둘 다. 사용할 호스트의 설정 디렉터리가 먼저 존재해야 합니다.

```bash
npm install -g oh-my-design
oh-my-design install
oh-my-design doctor
omd doctor
```

`oh-my-design doctor`는 호스트에 파일과 설정이 제대로 설치됐는지 확인합니다. `omd doctor`는 런타임, Chromium 존재 여부, 현재 프로젝트의 쓰기 권한, 내장 이론 팩을 확인합니다.

설치 프로그램은 Chromium을 설치하지 않습니다. `omd doctor`가 Playwright 또는 Chromium 실행 파일을 찾지 못했다면 출력에 나온 항목을 설치하고 다시 검사하세요. 전역 설치 환경에서는 보통 아래 명령을 사용합니다.

```bash
npm install -g playwright
npx playwright install chromium
omd doctor
```

두 doctor가 통과하면 호스트에서 메인 디자인 스킬을 실행합니다. 스킬이 보이는 방식은 호스트마다 다릅니다. 자세한 내용은 [스킬과 호출 방식](#스킬과-호출-방식)을 참고하세요.

## 사람 디자이너의 작업 루프

`omd-ultradesign`은 아래 순서를 지킵니다.

1. **사전 점검**: 프로젝트 절대 경로를 고정하고 `omd doctor`를 실행합니다. 저장소를 살펴보고 Figma 링크가 있는 작업은 `omd-figma`로 보냅니다.
2. **프레임**: 브리프를 캐묻고 문제, 재정의 가설, 핵심 과업, 가장 자주 하는 행동, 가장 큰 비용을 만드는 오류를 근거와 함께 기록합니다.
3. **콘셉트**: 생성 원리, 시각적 레지스터, 타이포그래피 방향, 기억에 남길 장면을 정합니다.
4. **리서치**: 도메인, 경쟁 제품, 사용자 언어, 필요한 컴포넌트, 타이포그래피, 관련 모션을 측정 가능한 레퍼런스로 모읍니다.
5. **카피 작성**: 레이아웃을 잡기 전에 전담 writer가 사실 근거를 추적할 수 있는 카피 덱을 만듭니다.
6. **블라인드 카피 리뷰**: 새 리뷰어는 브리프, 카피, 사실 원장, 보이스 근거만 봅니다. 렌더, 코드, 레이아웃, 선택 이유, 작성자는 볼 수 없습니다.
7. **타이포그래피 블라인드 proof**: typesetter가 실제 카피를 1280x900과 390x844의 중립 specimen으로 렌더합니다. 새 eye가 구조와 선택 이유를 모른 채 리뷰하고 typesetter가 고쳐 다시 렌더합니다.
8. **구조 발산**: 기본은 서로 격리된 구조안 2개입니다. 쇼피스이거나 구조 불확실성과 영향이 크면 3개를 만듭니다.
9. **블라인드 선택**: 새 선택 담당자가 익명 후보를 과업 적합성, 실제 콘텐츠 수용력, 위계, 반응형 비용, 접근성 위험으로 비교합니다.
10. **한 번 구현**: 선택한 구조 하나만 프로덕션 코드로 만듭니다. 구현 담당자는 후보를 다시 늘리지 않습니다.
11. **만들면서 성찰**: semantic checkpoint 뒤 선택된 데스크톱·모바일 컨테이너에서 글꼴을 다시 증명한 다음, 모션 전에 visual checkpoint를 남깁니다.
12. **결과 관찰**: 데스크톱·모바일 렌더, squint 렌더, 필요한 filmstrip, 규칙 검사, 선언된 로컬 probe가 리뷰 증거가 됩니다.
13. **비평과 재정의**: squint만 보는 glance가 위계를 먼저 적습니다. 별도의 고해상도 렌더 리뷰어가 완성도와 사용자 결과를 판단하고, 진행 담당자가 렌더를 보고 달라진 문제 정의를 기록합니다.
14. **인계**: 프로젝트 테스트와 빌드, 적용 가능한 디자인 게이트, 남은 검사 결과와 근거를 함께 보고합니다.

Figma나 명시적인 비주얼 타깃에는 이미 구조 결정이 들어 있습니다. 이런 경로에서는 구조 발산을 생략할 수 있으며, 생략 이유를 기록합니다.

## 단계별 산출물과 증거 경계

| 단계 | 지속되는 산출물 | 경계 |
| --- | --- | --- |
| 프레임 | `.omd/frame.md` | 사용자 문장, 조사·인터뷰 문장, 데이터, 이름을 밝힌 경쟁 제품 관찰 중 하나가 근거로 필요합니다. OMD 내부 지침은 근거가 아닙니다. |
| 리서치 | `.omd/refs/*.json` | 구현 담당자는 베낄 화면 대신 측정값과 원리를 받습니다. 독립 scout 스킬에는 별도의 캡처 기준이 있고, 파이프라인 scout는 모든 작업에 같은 수량을 강제하지 않고 필요한 범위를 채웁니다. |
| 카피 | `.omd/copy-deck.md` | 실제로 나가는 사실 문구는 모두 `verified` 팩트 ID를 참조합니다. `fixture`는 밀도 테스트 전용이고 `open`은 실제 문구의 근거로 쓸 수 없습니다. |
| 블라인드 카피 리뷰 | 리뷰 handoff | 리뷰어는 렌더, 소스, 레이아웃, frame, decisions, 작성자를 보지 않고 카피도 직접 고치지 않습니다. writer가 리뷰를 반영한 뒤 `omd copy --check`를 다시 실행합니다. |
| 타이포그래피 proof | `.omd/type-proof.md`, `.omd/.cache/type-proof/` specimen | 실제 언어의 카피로 역할, 출처·라이선스, 글리프 범위, 요청·계산된 family와 weight, axis, fallback·loading, wrap·clip, 탈락 대안을 두 viewport에서 증명합니다. 브라우저 증거만으로 각 글리프를 그린 물리 글꼴을 식별하지 않습니다. |
| 구조 스케치 | `.omd/.cache/sketches/<id>/` | 각 후보는 정제된 frame, 실제 카피, 승인된 type role·family·weight·size/measure 계약, 구조 축 하나, 익명 ID만 받습니다. 타이포그래피를 보존하고 구조만 바꾸며, 탈락한 type 선택 이유와 다른 후보·프로덕션 소스는 볼 수 없습니다. |
| 블라인드 선택 | `.omd/taste/preferences.jsonl` | 선택 담당자는 익명 렌더와 정제된 과업 정보만 봅니다. 후보의 설명과 작성자는 가립니다. `omd choose`는 선택한 후보와 이유를 에이전트 선택 기록으로 저장합니다. |
| 프로덕션 구현 | 저장소 소스 | 구현 담당자 한 명이 선택한 구조 하나를 구현하고 카피 덱을 보존합니다. 별도의 `omd decision` 항목은 구현 이유를 `.omd/decisions.md`에 기록하며 후보 선택 기록과 구분됩니다. |
| 프로덕션 근거 | `.omd/attribution.md` | 구현 담당자가 실제로 사용한 토큰, 모션, 구성, 그래픽의 출처를 기록합니다. |
| Craft checkpoint | `.omd/craft.jsonl` | semantic과 visual checkpoint에서 관찰한 문제와 그 때문에 바꾼 내용을 각각 기록합니다. |
| 렌더 리뷰 | 임시 렌더, filmstrip, probe 출력 | squint 전담 리뷰어는 squint 렌더만 봅니다. 고해상도 렌더 리뷰어도 구현자의 선택 이유 대신 정제된 과업과 측정 결과를 받습니다. |
| 재정의 | `.omd/frame.md` revision | `omd frame reframe`은 처음 frame을 지우지 않고 렌더가 드러낸 내용을 덧붙입니다. |

사람의 승인 시점과 craft checkpoint는 다른 개념입니다. 기본값은 `checkpoint: none`이고, `.omd/config.json`에서 concept, structure, both 중 하나를 선택할 수 있습니다.

## 스택 선택 순서

모든 구현 담당자는 아래 우선순위를 따릅니다.

```text
사용자의 명시적인 요청
  > 기존 저장소의 스택과 툴체인
  > 완전히 빈 새 프로젝트에서만 React + Vite + TypeScript
```

기존 vanilla HTML도 보존해야 할 스택입니다. 알아보지 못한 패키지나 툴체인은 빈 저장소로 취급하지 않고 먼저 조사합니다. 새 프로젝트에 plain HTML을 쓰는 경우는 사용자가 직접 요청했을 때뿐입니다.

빈 프로젝트의 기본 scaffold에 필요한 의존성은 추가할 수 있습니다. 기존 프로젝트에는 필요 없는 의존성을 넣지 않습니다.

`omd design`은 저장소 근거를 찾고 `.omd/design.md`가 없을 때만 새 파일을 만듭니다. 이미 파일이 있다면 내용을 보존하고 근거 탐색과 검증 요약만 출력합니다.

## 스킬과 호출 방식

사용자가 직접 쓰는 공개 스킬은 6개입니다.

| 정식 이름 | 용도 |
| --- | --- |
| `omd-ultradesign` | 페이지, 앱, 대시보드, 블로그, 랜딩 페이지, 리디자인에 전체 사람 디자인 루프를 실행합니다. |
| `omd-figma` | Figma 파일을 가져와 시스템을 추출하고, 프레임과 반응형 쌍을 구현한 뒤 측정한 충실도를 보고합니다. |
| `omd-scout` | 디자인이나 구현 없이 독립적인 측정 레퍼런스 보드를 만듭니다. 최소 18개를 수집하고 25개를 목표로 합니다. |
| `omd-critique` | 기존 디자인을 고치지 않고 리뷰합니다. 검사 결과를 원인별로 묶고 렌더 완성도를 판단합니다. |
| `omd-humanize` | 사실을 바꾸지 않으면서 기계적인 문장 습관과 번역투를 다듬습니다. |
| `omd-coach` | 누적된 check history에서 반복 문제와 추세를 읽고 다음 연습 항목을 제안합니다. 취향 기록은 읽지 않습니다. |

소스와 direct install에서 쓰는 정식 이름에는 `omd-*` 접두사가 붙습니다. Codex UI에서는 `(omd) <skill>` 형태로 보입니다. 예를 들면 `(omd) ultradesign`입니다.

검증된 installer는 정식 이름의 스킬을 감지한 호스트에 직접 복사합니다. 각 호스트 화면에 표시되는 이름으로 선택하세요. slash command 모양은 호스트가 정합니다. Marketplace용 manifest도 함께 배포되며, Claude marketplace flavor의 plugin 참조는 `oh-my-design:<skill>` namespace를 씁니다. Marketplace가 검증된 direct install 경로와 완전히 같다고 단정하지 않습니다.

## 내부 파이프라인 에이전트

아래 8개는 사용자가 호출하는 공개 명령이 아니라 디자인 루프 내부 역할입니다.

| 에이전트 | 역할 | 쓰기 경계 |
| --- | --- | --- |
| `omd-framer` | 브리프를 질문하고 근거가 있는 frame을 기록합니다. | 읽기 전용이며 frame CLI로만 기록합니다. |
| `omd-scout` | 파이프라인에 필요한 범위를 채우도록 측정 근거를 조사합니다. | 읽기 전용이며 ref CLI로만 기록합니다. |
| `omd-writer` | 카피 덱과 사실 원장을 작성하거나 고칩니다. | `.omd/copy-deck.md`만 씁니다. |
| `omd-typesetter` | 구조 전에 실제 카피 타이포그래피 proof를 만들고 수정합니다. | `.omd/type-proof.md`와 `.omd/.cache/type-proof/`만 다룹니다. |
| `omd-sketch` | 실제 카피로 격리된 grayscale 구조안 하나를 만듭니다. | 자기 임시 후보 디렉터리만 씁니다. |
| `omd-hand` | 선택된 구조를 구현하고 craft checkpoint 두 개를 기록합니다. | 프로덕션 저장소와 선언된 OMD 기록을 다룹니다. |
| `omd-glance` | squint 렌더만 보고 즉각적인 위계를 적습니다. | 쓰지 않습니다. |
| `omd-eye` | 익명 구조를 고르거나, 카피·타이포그래피 proof를 블라인드 리뷰하거나, sharp 렌더를 비평합니다. | 쓰지 않습니다. |

에이전트는 구체적인 모델을 고정하지 않고 세션에서 선택한 모델을 상속합니다. `high`와 `medium` reasoning 값은 역할의 의도를 전달합니다.

Claude Code는 agent metadata의 denied tool을 선언적으로 적용할 수 있습니다. Codex agent 파일에는 같은 용도의 tool restriction 필드가 없어 읽기 전용 제한을 prompt contract로 전달합니다. 따라서 Codex 쪽 제한을 파일시스템 hard sandbox라고 표현하지 않습니다.

## 검증 체계

OMD는 규칙 검사와 렌더 리뷰를 함께 씁니다.

| 층 | 명령과 증거 |
| --- | --- |
| 카피·디자인 계약 | `omd copy --check`는 덱 구조와 명시적 팩트 참조를 검사합니다. `omd design --check`는 디자인 계약의 섹션 범위를 검사합니다. 문장 완성도나 사실의 진위까지 판정하지는 않습니다. |
| 타이포그래피 proof | 구조안 전에 중립 데스크톱·모바일 specimen을 검토하고, semantic 구조 뒤 visual checkpoint 전에 실제 컨테이너에서 다시 증명합니다. 카피, font family/file, weight/axis, container width가 바뀌면 proof는 무효입니다. |
| 렌더 증거 | `omd render`는 sharp screenshot을 만들고, `--squint`는 grayscale과 blur로 위계를 분리하며, `--filmstrip`은 로드 중 프레임을 남깁니다. Squint는 시간을 재는 첫인상 시뮬레이터가 아닙니다. |
| 인터랙션 | `omd probe`는 선언된 안전한 로컬 plan만 실행하고 expectation 또는 tab order 실패를 보고합니다. |
| 디자인 lint | `omd check`는 `system`, `a11y`, `slop`, `motion`, `ux` 조건을 검사합니다. contrast와 hit-area 규칙은 error이며, slop과 다른 품질 하한 규칙은 각 규칙 정의에 따라 warning으로 보고됩니다. |
| 사이트 일관성 | `omd check --site <dir>` 또는 페이지 경로를 여러 개 넘기는 방식으로 페이지 간 ladder와 token drift를 찾습니다. |
| 레퍼런스 거리 | `omd ref distance <page>`는 저장된 레퍼런스와 측정 특성을 비교해 결과가 지나치게 가까운지 살핍니다. |
| Figma 충실도 | `omd figma pull`, `system`, `diff`가 Figma snapshot과 구현 결과를 측정 보고서로 연결합니다. |
| 비주얼 타깃 | `omd target set <이미지-경로-또는-URL> --as <name>`과 `omd target diff`로 등록한 PNG 타깃을 정해진 범위 안에서 비교합니다. URL은 임의 웹페이지가 아니라 HTTP(S) 이미지 직접 URL이어야 합니다. |

`omd figma pull`에는 Figma personal access token이 필요합니다.

```bash
export FIGMA_TOKEN=...
```

`omd doctor`는 `FIGMA_TOKEN`이 없어도 선택 기능으로 보고 해당 항목을 통과시킵니다. 토큰을 설정하기 전에는 Figma pull을 사용할 수 없습니다.

Slop 검사 결과는 warning이자 품질 하한입니다. AI가 만들었다는 사실을 판정하지 않습니다. 이유를 적은 overrule는 작업 의도를 기록할 뿐 검사 결과를 숨기거나 명령의 종료 상태를 바꾸지 않습니다. `omd check`는 검사 결과가 하나라도 있으면 exit status 1을 반환하므로 CI에 연결할 수 있습니다.

규칙만으로는 optical balance, 구성 리듬, 타이포그래피 완성도, 기억에 남길 장면이 콘셉트에 맞는지 안전하게 판정할 수 없습니다. 그래서 렌더 비평이 필요합니다.

## 인터랙션 적용 범위

카피 덱은 interaction scope를 정확히 하나 선언합니다.

| 범위 | 필요한 증거 |
| --- | --- |
| `stateful` | Primary·recovery copy, `.omd/probes/primary.json`, `.omd/probes/recovery.json`가 필요하며 두 probe를 모두 실행합니다. |
| `navigation-only` | Primary copy와 primary probe가 필요합니다. Recovery copy와 recovery probe에는 구체적인 이유와 함께 `N/A`를 적습니다. |
| `static` | Primary copy가 필요합니다. Recovery copy와 두 probe에는 구체적인 이유와 함께 `N/A`를 적습니다. |

Loading, empty, error, success, disabled, offline, recovery state는 실제로 도달할 수 있는 화면에만 설계합니다. 체크리스트를 채우기 위해 가짜 상태를 만들지 않습니다. 리뷰어는 전달받은 probe 증거가 있을 때만 인터랙션에 관해 판단합니다.

Probe plan에는 expectation이 붙은 click, fill, keypress 단계만 선언할 수 있습니다. 로컬 파일과 localhost·loopback URL만 허용하며, 로그인·인증 정보·원격·파괴적·미선언 동작은 거부합니다. 화면의 컨트롤을 찾아 자동으로 클릭하지 않습니다.

## 프로젝트 상태

오래 남고 리뷰할 수 있어야 하는 기록은 `.omd/` 바로 아래에 둡니다.

- `frame.md`, `copy-deck.md`, `type-proof.md`, `design.md`, `decisions.md`
- `attribution.md`, `motion-spec.md`, `craft.jsonl`, `config.json`
- `refs/*.json`, 선언한 `probes/*.json`, `taste/preferences.jsonl`, `history.jsonl`

생성한 IR, 렌더, filmstrip, sketch 후보, probe 결과, 임시 출력은 `.omd/.cache/`에 둡니다. 임시 저장소를 지워도 디자인 의도는 남아야 합니다.

단일 페이지 `omd check`를 끝냈고 `--no-log`를 쓰지 않았을 때만 `.omd/history.jsonl`에 기록을 덧붙입니다. Site 검사와 여러 페이지 검사는 history에 남기지 않습니다.

`oh-my-design uninstall`은 설치한 OMD 파일과 설정 변경을 제거하지만 프로젝트의 `.omd/`는 보존합니다.

## 설치 방식

Direct installer가 지원되고 회귀 테스트로 검증된 경로입니다.

| 호스트 | Direct install |
| --- | --- |
| Claude Code | 스킬은 `~/.claude/skills`, 에이전트는 `~/.claude/agents`에 복사합니다. `settings.json` 권한을 수정하고 예전 OMD `PreToolUse` hook을 제거합니다. |
| Codex | versioned plugin cache, direct skill, agent TOML을 `~/.codex` 아래에 복사하고 `config.toml`을 수정합니다. Codex hook trust는 확인됐다고 과장하지 않고 doctor에서 unverified로 표시합니다. |

감지한 호스트 하나만 설치·검사·제거하려면 `--host claude` 또는 `--host codex`를 씁니다.

```bash
oh-my-design install --host codex
oh-my-design doctor --host codex
oh-my-design uninstall --host codex
```

저장소에는 Claude와 Codex marketplace packaging을 위한 manifest도 생성됩니다. 배포 산출물이지만 direct installer와 같은 수준의 end-to-end parity를 주장하지 않습니다.

## CLI 빠른 참조

`node bin/omd.ts --help`의 명령을 간단히 묶으면 다음과 같습니다.

```text
omd ir <page> [-o file]
omd render <page> -o shot.png [--viewport WxH]
omd render <page> --squint -o shot.png
omd render <page> --filmstrip -o filmstrip.html [--viewport WxH]
omd probe <page> [--plan path] [--json] [--out path]
omd check [<page>|--ir file] [--json] [--category slop] [--no-log]
omd check --site <dir>
omd check <page1> <page2> ...
omd coach

omd frame show
omd frame set --problem P --reframe R --why EVIDENCE [--task T --frequent-action A --costliest-error E]
omd frame reframe --to "..." --because "..."
omd frame generator --set "metaphor"
omd choose c1 c2 --chose c2 --why "..."
omd decision "what" --why "why"
omd taste record "subject" --kind selection|praise|rejection|overrule --evidence "verbatim" --from-user
omd taste profile [--all]
omd config set checkpoint none|concept|structure|both
omd config show
omd craft checkpoint semantic|visual --render path --observed "..." --changed "..."
omd craft status [--json]

omd ref add <url|file> --as <component> [--selector "css"] [--image] [--blueprint]
omd ref list
omd ref distance <page>
omd ref principles <source> --as <component> --add "..."
omd ref show <source> --as <component>

omd design
omd design --check
omd copy --check [--json]
omd pack dir
omd pack list
omd pack <relpath>
omd doctor

omd figma pull <file-url>
omd figma system
omd figma diff <frame-id> <page-or-url>
omd target set <이미지-경로-또는-URL> --as <name>
omd target list
omd target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]
```

## 구조와 기여 방법

Prompt 원본:

- `src/agents/*.agent.yaml`
- `src/skills/omd-*/SKILL.md`

생성되는 산출물:

- `agents/`
- `skills/`
- `dist/`

생성 파일은 직접 수정하지 않습니다. Build가 direct host와 plugin packaging용 파일을 다시 만듭니다.

직접 수정하는 경로는 `core/`, `bin/`, `adapters/`, `test/`, `evals/`, `scripts/`, `README.md`, `README.ko.md`와 `core/` 아래 이론·레시피 팩입니다.

변경을 제출하기 전에 아래 검사를 실행합니다.

```bash
npm test
npx tsc --noEmit
npm run build
```

새 linter rule은 범위를 좁게 잡고 positive·negative test를 함께 두며 예외 없이 warning으로 추가합니다.

## 한계와 신뢰 범위

- Prompt는 판단 절차를 정합니다. 실제 프로젝트 근거, 쓸 수 있는 카피, 렌더 확인, 프로젝트별 검증이 부족하면 좋은 디자인을 보장할 수 없습니다.
- Probe는 로컬, 비인증, 비파괴 경로만 다룹니다. 범용 브라우저 자동화 도구가 아닙니다.
- Copy validator는 필수 구조, 인터랙션 적용 범위, 미해결 자리표시자, 명시적인 사실 ID 참조를 검사합니다. 문장 완성도와 사실 확인은 사람이 맡습니다.
- Reference distance, lint, image diff는 측정값입니다. 판단을 돕지만 대신하지 않습니다.
- Marketplace manifest도 제공하지만 install-to-doctor 회귀 테스트가 다루는 경로는 direct installer입니다.

[MIT License](LICENSE)로 배포됩니다.
