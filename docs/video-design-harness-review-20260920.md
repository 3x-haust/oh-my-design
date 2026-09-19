# 디자인 하네스 영상 요약과 OMD 적용·갭 분석

작성일: 2026-09-20 · OMD 분석 기준: `53f03fdbac7477799af9404e4a8cd7ffd67069f4`

## 1. 먼저 결론

**OMD에 가장 필요한 것은 레퍼런스를 저장하는 기능을 더 늘리는 것보다, 검색·관찰·해석·화면 반영을 끝까지 연결하는 것이다.** 최근 추가한 화면별 적용표는 이 연결의 중간 부분을 해결했다. 그러나 검색어를 실제 실행했는지, 도메인 플로우의 행동을 실제 수행했는지, 적용표의 각 결정을 최종 화면에서 검증했는지는 서로 다른 증거다. 현재 구현에서는 이 구분과 연결에 여전히 공백이 있다.

이 문서는 영상의 설명을 그대로 정답으로 채택하지 않는다. 영상 내용, 공개 하네스 코드, OMD 현재 코드를 구분하고, 아래 개선안은 **우리 프로젝트를 위한 분석·제안**으로 적었다. 이번 작업은 분석 문서 작성이며, 아래 미구현 항목을 개발하거나 기존 테스트 앱을 재제작한 작업은 아니다.

### 확인 범위와 출처

- 영상: [피튜브 — 「[허들링클럽] 요즘 프로덕트 디자이너는 와이어 프레임 직접 안그려요」](https://www.youtube.com/watch?v=yQcR1Dz5UDA), 공개일 2026-09-19, 길이 1:40:22.
- 확인 방법: 한국어 자동 자막 전체(0:01–1:40:15)를 읽고, 약 51:31·1:10:45·1:27:20·1:38:35의 시연 화면을 브라우저에서 별도로 확인했다. 전 구간을 연속 재생하며 청취한 것은 아니다. 자동 자막의 제품명·인명 오인식은 문맥과 공개 저장소로 보완했다.
- 자막 파일 SHA-256: `f34aa2870d6a74c5fab679c532abc91e046f010f9fe0b8688c1f0f9a8b3b0bac`. 원문 전체나 영상 자산은 이 저장소에 복제하지 않았다.
- 영상 설명에 연결된 [Design Flow Harness Codex](https://github.com/figmatutor-info/designflowharness-codex/tree/26104979b9807195ace8c84545564acb75186f20)를 대조했다. 공개 코드의 상태와 영상 속 실행 결과는 동일한 증거가 아니다.
- OMD는 위 커밋의 소스·프롬프트·검증 코드를 직접 확인했다. 과거 test-009/010의 실패를 최신 버전에서 재현했다고 주장하지 않는다. `work` 스킬·위키 기록은 사용하지 않았다.

## 2. 영상 핵심 요약

전체 내용 중 하네스에 직접 관련된 부분을 압축했다. 모델 우열·소요 시간에 대한 발표자의 체감은 일반 성능 사실로 채택하지 않았다.

| 구간 | 핵심 내용 |
| --- | --- |
| [14:40](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=880s) | 좋은 하네스의 기준으로 SSOT, 강제성, 역할 분리, 단계별 게이트를 제시한다. |
| [17:20](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=1040s) | 선언문·실행 절차만으로는 부족하며, 위반을 차단하는 검증 장치를 설명한다. |
| [25:52](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=1552s) | 목표·사용자·성공 기준·범위·비목표부터 정하고, 사람의 작업 순서를 무조건 복제하지 않는다. |
| [41:15](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=2475s) | 최소 규칙으로 대표 시안을 비교한 뒤, 선택된 방향의 토큰·컴포넌트·전체 화면으로 확장한다. |
| [45:29](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=2729s) | PRD를 바탕으로 UI Bowl에서 앱 화면을 수집하고, 패턴·적용 판단·근거 공백을 다음 단계에 전달한다. |
| [57:02](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=3422s) | 화면의 정보 순서·행동·상태를 문서로 먼저 정리한다. |
| [1:10:45](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=4245s) | A/B/C를 비교하고 사람이 B를 선택한다. 에이전트 추천과 사람 선택은 달랐다. |
| [1:27:20](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=5240s) | primitive/semantic 토큰과 상태별 컴포넌트를 정리한다. |
| [1:38:35](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=5915s) | 장문·항목 수·오류 등의 콘텐츠 QA 사례를 보여 준다. |

주의할 점: 시연은 Figma 산출물 중심이며 실행 가능한 서비스 전체의 검증은 아니다. 후반에는 결과의 빈 부분과 정리 품질에 대한 아쉬움도 드러난다. 따라서 ‘유료 MCP를 연결하면 완성도가 보장된다’는 결론은 이 영상으로 입증되지 않는다. [최종 결과 확인 구간](https://www.youtube.com/watch?v=yQcR1Dz5UDA&t=5754s)

## 3. 공개 하네스에서 실제로 배울 수 있는 구조

영상의 인상만이 아니라 연결된 공개 코드에서 확인한 내용이다.

- **수집과 해석의 산출물이 다르다.** 원본 이미지와 `index.json`을 모으는 단계 다음에 `analysis.md`에서 패턴·예외·적용·제외를 해석한다. 파일명만 보고 분석하지 않도록 지시한다. [수집 스킬](https://github.com/figmatutor-info/designflowharness-codex/blob/26104979b9807195ace8c84545564acb75186f20/.agents/skills/collect-references/SKILL.md), [분석 스킬](https://github.com/figmatutor-info/designflowharness-codex/blob/26104979b9807195ace8c84545564acb75186f20/.agents/skills/analyze-references/SKILL.md)
- **화면 단위로 근거와 요구사항을 연결한다.** 화면에 참조 ID, 근거 범위, 상태, 컴포넌트, viewport, 콘텐츠 사례가 붙는다. 컨셉·선택·컴포넌트·화면·시각 검토도 별도 계약이다. [계약 문서](https://github.com/figmatutor-info/designflowharness-codex/blob/26104979b9807195ace8c84545564acb75186f20/docs/contracts.md)
- **도구보다 입력 계약을 유지한다.** UI Bowl 도구가 없으면 허용된 브라우저 캡처나 사용자 이미지로 대체하고 공백을 남긴다. 공개 버전의 캐릭터 정책은 기존 로컬 자산 재사용이다. 이미지 생성이 필수는 아니다. [도구 연결 문서](https://github.com/figmatutor-info/designflowharness-codex/blob/26104979b9807195ace8c84545564acb75186f20/docs/tool-adapters.md)

그대로 복제하면 안 되는 부분도 있다. 입력 게이트는 참조 이미지 존재와 화면 매핑 등을 검사하지만, `analysis.md`의 시각 판단 자체를 인증하지 않는다. 또한 `prd-derived`를 허용하면서도 모든 화면에 비어 있지 않은 참조 ID를 요구하는 구현이 있어, ‘직접 근거가 없는 화면’의 계약 해석에는 주의가 필요하다. OMD의 브리프 기반 항목에 참조 ID를 억지로 채우면 안 된다. [실제 게이트 구현](https://github.com/figmatutor-info/designflowharness-codex/blob/26104979b9807195ace8c84545564acb75186f20/scripts/lib/gates.mjs)

## 4. OMD 현재 상태: 있는 것과 없는 것을 구분

‘구현 있음’은 해당 코드·검증 경로가 있다는 뜻이다. 실제 사용자 프로젝트에서 좋은 결과가 반복 재현됐다는 뜻은 아니다.

| 항목 | 현재 판정 | 확인 근거와 경계 |
| --- | --- | --- |
| 도메인·디자인 리서치 분리 | 구현 있음 | 별도 저장 경로, 서비스 호스트·이미지 중복 방지, 디자인 역할 구분. [reference-research.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-research.ts:16) |
| 무료 디자인 출처 탐색 | 계획·캡처 검증 있음 / 검색 실행 증거는 부족 | Pinterest 등 검색어를 만들고 상세 항목의 캡처를 검증한다. 검색 계획 자체는 검색 실행 영수증이 아니다. [discovery-plan.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/discovery-plan.ts:13) |
| 화면별 레퍼런스 적용표 | 최근 구현됨 | 모든 도메인 화면에 두 종류의 근거·적용·제외·이유·확인 기준을 요구하고, 변경된 입력은 거부한다. [reference-application.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-application.ts:123) |
| 제작 단계로 전달 | 구현 있음 | brief와 선택된 레퍼런스 핸드오프에 출처를 제거한 화면별 결정을 전달한다. [brief/index.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/brief/index.ts:434), [selected-handoff.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/selected-handoff.ts:73) |
| 레퍼런스의 구현 영향 검증 | 기존 장치 있음 / 새 적용표와 연결 공백 | 선택된 assembly의 영향과 production build를 검사한다. 이것이 새 적용표의 모든 자유문장 항목을 자동 검증하는 것은 아니다. [reference-usage.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-usage.ts:33), [reference-influence-proof.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-influence-proof.ts:39) |
| 도메인 화면·기능·플로우 목록 | 구현 있음 / 실제 조작 인증은 별개 | 화면 도달 방법, 행동·결과, 기능, 흐름, 제외 사유를 모델링한다. 증거 검사 함수는 참조 파일의 존재·해시를 확인한다. [task-flow-benchmark.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/task-flow-benchmark.ts:20) |
| 콘텐츠·상태·스트레스 검증 | 구현 있음, 선택된 범위에 적용 | 상태 전이·복구·밀도 모델과 컴포넌트 단독/페이지 맥락의 증거 검사가 있다. 모든 프로젝트에 동일한 상태 목록을 강제하지 않는다. [content-state-model.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/design-development/content-state-model.ts:64), [component-stress-proof.test.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/test/component-stress-proof.test.ts:91) |
| 기존 서비스 `init` | 부분 구현 | CSS 선언과 `$value` 토큰 JSON을 관찰하고 원본·범위·해시를 보존한다. JSX 컴포넌트는 경로만 수집한다. [inventory.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/tokens/inventory.ts:99) |
| 슬롭 검사 → 수정 → 재검사 | 검증 연결 있음 | 미판정·미해결 항목, 수정 없이 해결 선언, 범위 축소, 오래된 캡처를 거부한다. 미감이나 독립성을 자동 인증하지 않는다. [review.ts](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/slop/review.ts:194) |
| 시안 비교와 사람 선택 | 정책 차이 | OMD 기본 제품 흐름은 에이전트 선택 후 계속 진행한다. 매번 사람 승인을 받는 방식과 다르며, 그 자체가 버그는 아니다. [ultradesign 원본](/Users/lyu/01_Project/01_Projects/OhMyDesign/src/skills/omd-ultradesign/SKILL.md:128) |

## 5. 아직 부족한 부분과 적용할 인사이트

### P0-A. ‘검색어가 있음’과 ‘검색을 했음’을 구분해야 한다

**코드에서 확인한 공백:** 조사 결과의 `queries`는 문자열 목록이다. Scout 지침은 실제 검색 결과나 차단 사유를 `scout.md`에 적도록 하지만, `research-check`가 검색 호출·결과 목록·방문 기록을 구조화된 실행 증거와 대조하는 계약은 아니다. 따라서 유효한 디자인 캡처가 있다는 사실만으로 ‘이번에 Pinterest를 검색했다’고 말할 수 없다. [조사 스키마](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-research.ts:72), [Scout 지침](/Users/lyu/01_Project/01_Projects/OhMyDesign/src/skills/omd-scout/SKILL.md:72)

**제안:** 기존 조사 기록에 검색 시도 단계를 연결한다. 최소한 provider, query, 결과 URL, 실제 연 상세 URL, 성공/로그인 필요/차단/결과 없음, 선택·탈락 이유를 구분한다. 도구가 제공하는 실행 결과를 근거로 삼고, 에이전트가 URL 목록을 적은 것만으로 실행을 인증하지 않는다.

**완료 조건:** 수행하지 않은 검색을 완료로 기록할 수 없고, 실패한 출처가 숨겨지지 않아야 한다. Pinterest가 막혔어도 다른 허용된 공개 출처에서 필요한 근거를 확보했다면 진행할 수 있어야 한다. 특정 사이트의 성공을 무조건 강제하지 않는다.

### P0-B. 도메인 플로우의 행동 기록을 실제 브라우저 전이와 묶어야 한다

**코드에서 확인한 공백:** `reachedBy.action/result`, flow의 `action/result`는 설명문이다. `validateTaskFlowBenchmarkEvidence`는 파일 바이트의 해시를 검사하지만, 그 파일이 해당 행동 직후의 화면인지, 어떤 브라우저 조작으로 도달했는지를 대조하지 않는다. 조사 원본 캡처의 출처 검증과 행동 단계 검증은 서로 다르다. [행동 필드](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/task-flow-benchmark.ts:299), [증거 검사](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/task-flow-benchmark.ts:661)

**제안:** 실제로 수행한 안전한 행동의 전후 상태·URL·캡처를 단계 ID로 연결한다. 라이브 조작, 공개 화면 모음의 관찰, 정적 이미지로부터의 추론을 다른 증거 등급으로 둔다. 공개 앱 이미지 모음을 받았다는 이유로 실제 앱을 조작한 것으로 승격하지 않는다.

**완료 조건:** 미방문 상태와 정적 이미지에는 라이브 조작 완료 표시가 붙지 않는다. 발견한 범위는 방문 또는 이유 있는 제외로 모두 정리한다. 로그인·결제·제출·삭제가 필요한 경계는 멈추거나 별도 승인을 받아야 하며, ‘모든 화면 확인’을 위해 위험한 행동을 실행하지 않는다.

이 항목은 해당 검증 함수의 보장 범위를 확인한 것이다. 모든 호스트 경로를 우회할 수 있음을 재현한 보안 진단은 아니다.

### P0-C. 적용표의 각 결정을 최종 렌더 검증에 연결해야 한다

**코드에서 확인한 공백:** 새 적용표의 `checks`는 문자열 배열이고 개별 criterion ID·검증 결과·캡처 참조가 없다. 현재 완료 검증은 적용표의 존재와 최신성을 검사한다. 기존 influence proof는 assembly/selection/build에 묶여 있으나 새 `applicationSha256`와 항목별 검증을 직접 포함하지 않는다. [적용표 스키마](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-application.ts:28), [완료 검사](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/completion/preflight.ts:48)

또한 적용표 해시는 전달 자료에 포함되지만, 현재 adaptive source seal의 승인 입력 목록에 적용표 자체의 영수증은 없다. 적용표만 재발행했을 때 이전 렌더·판정을 어떤 범위까지 다시 검사해야 하는지 명시적으로 연결할 필요가 있다. 현재 소스 연결에서 확인한 공백이며, 최종 완료 우회 시나리오를 실행해 재현한 것은 아니다. [source seal 입력](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/source-seal/adaptive-inputs.ts:26)

**제안:** 기존 검증 장치 위에 다음 연결을 추가한다. 비슷한 새 검사 시스템을 하나 더 만들 필요는 없다.

```text
현재 적용표 해시 + 화면/criterion ID
  → 구현 대상과 적용된 결정
  → 현재 build의 실제 화면·viewport·상태
  → 관찰 증거 + 충족/수정 필요/타당한 이탈 판정
  → 수정한 범위의 재검사
```

**완료 조건:** 적용표 항목 누락, 이전 build의 증거 재사용, 적용표만 바꾸고 이전 판정을 그대로 유지하는 경우가 검출된다. 자동으로 측정할 수 있는 사실과 시각 판단을 분리한다. ‘더 세련됨’ 같은 표현을 임의 점수로 통과시키지 않는다.

### P1-D. `init`을 파일 목록에서 재사용 가능한 컴포넌트 지식으로 확장한다

**코드에서 확인한 한계:** 현재 `init`은 안전한 정적 관찰 도구다. 런타임 스타일·cascade를 계산하지 않고, 토큰 별칭에 의미를 추정하지 않으며, 컴포넌트 props·variants·상태는 읽어 내지 않는다. 따라서 ‘기존 디자인 시스템 전체를 학습했다’고 표현하면 과장이다. [수집 범위와 한계](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/tokens/inventory.ts:113)

**제안:** 현재 관찰 원본은 보존하고, 별도 검토된 재사용 계약을 만든다. 기존 컴포넌트의 import 경로, 실제 props/variants, 필요한 상태, 사용 예제, 토큰 의존 관계, 대표 렌더를 연결한다. 설정 파일을 임의 실행하거나 관찰한 CSS를 승인 토큰으로 자동 승격하지 않는다.

**완료 조건:** 기존 컴포넌트를 재사용하는 새 화면에서 실제 import·상태·토큰 연결을 확인할 수 있어야 한다. 지원하지 않는 스타일 방식은 누락으로 표시하고, 사용자 서비스의 기존 파일과 승인된 토큰을 덮어쓰지 않는다.

### P1-E. 사용자가 ‘무엇을 골랐고 어디에 썼는지’ 바로 볼 수 있게 한다

**현재 상태:** 디자인 레퍼런스 미리보기 문서와 적용표 문서는 이미 생성된다. 다만 이것만으로 사용자가 두 문서를 실제로 확인했고 방향에 동의했다고 볼 수 없다. [미리보기 생성](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-research.ts:246), [적용표 생성](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/ref/reference-application.ts:146)

**제안:** 기존 JSON에서만 파생되는 읽기 전용 검토 화면을 만든다. 도메인/디자인 탭을 분리하고, 각 원본 미리보기 옆에 적용 화면·적용할 점·제외할 점·공백을 나란히 표시한다. 이는 새 판단 원본이 아니라 기존 기록을 보는 뷰여야 한다. ‘검색 성공’, ‘선정됨’, ‘구현 반영’, ‘사용자 확인’을 별도 상태로 표시한다.

**완료 조건:** 사용자가 원본을 열지 않고도 어떤 출처가 기능 근거인지 시각 근거인지 구분하고, 원하면 실제 출처와 구현 결과를 열어 비교할 수 있다. 좋은 갤러리의 이름이나 인기만으로 품질을 승인하지 않는다.

### P1-F. 대표 시안 비교를 지원하되, 승인 정책은 명시적으로 선택한다

**정책 차이:** 현재 OMD는 기본적으로 리서치와 시각 방향을 사용자에게 매번 선택시키지 않는다. 이를 버그로 취급해 모든 단계에 승인 질문을 추가하면 기존 one-shot 동작과 충돌한다. [현재 선택 정책](/Users/lyu/01_Project/01_Projects/OhMyDesign/src/skills/omd-ultradesign/SKILL.md:128)

**제안:** 사용자가 시안 선택을 원할 때만 대표 화면 비교 지점을 활성화한다. 같은 내용으로 정보 우선순위·밀도·공간 배치를 비교하고, 선택 이유와 손해를 기록한다. 후보 수는 과제의 불확실성에 따라 정한다. 색만 다른 세 안을 모든 프로젝트에 의무적으로 만들지 않는다.

**완료 조건:** 사람 선택과 에이전트 선택이 섞이지 않고, 선택 이후 방향을 바꾸면 영향을 받는 산출물만 다시 검토한다. 현재 이미지 생성 보류는 유지하며, 렌더 가능한 HTML/CSS 비교안을 활용할 수 있다. [기존 개념 탐색 기준](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/theory/imagegen.md:271)

### P1-G. 상태·장문 QA는 새로 만들기보다 현재 모델과 사용자 결과를 연결한다

OMD에는 이미 상태·복구·콘텐츠 밀도 모델과 컴포넌트 스트레스 증거가 있다. 따라서 ‘QA가 없다’가 아니라 **실제 프로젝트에서 어떤 사례가 선정됐고 어떤 화면으로 확인됐는지를 보이게 하는 것**이 개선 방향이다.

요구사항에서 도출한 짧은/긴 내용, 최소/대표/최대 항목 수, 적용 가능한 오류·빈 상태·재시도를 실제 viewport로 검사한다. 필요하지 않은 로딩·오프라인 상태를 숫자 맞추기용으로 만들지 않는다. 최초 실행이 깨끗하면 불필요한 수정 루프를 강제하지 않고, 실제 문제가 발견된 경우에만 수정·재검사 연결을 요구한다. [스트레스 계약](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/design-development/component-stress-proof.ts:153), [슬롭 종료 조건](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/slop/review.ts:194)

## 6. 무료 경로로 가져올 운영 방식

여기서 ‘무료’는 추가 유료 레퍼런스 MCP·유료 다운로드·이미지 생성 API를 구매하지 않는다는 뜻이다. 기존 AI 구독료나 모든 서비스의 접근 가능성까지 무료라고 보장하는 뜻이 아니다.

1. **입력 고정:** 사용자 과업·필수 결과·범위·비목표를 확인한다. 기존 서비스라면 현재 `omd init`으로 관찰 자료를 만들고 지원하지 않는 영역을 따로 검토한다.
2. **도메인 리서치:** 유사 서비스의 안전한 범위에서 화면·기능·흐름을 조사한다. 무엇을 확인하지 못했는지도 남긴다.
3. **디자인 리서치:** 현재 `omd ref discover-plan --json`의 출처 후보·검색어로 실제 공개 상세 페이지를 찾는다. 서비스 이용 조건을 확인하고, 막히면 다른 출처로 이동한다. 정적 화면은 정적 근거로만 쓴다.
4. **선정과 해석:** 실제 저장된 이미지를 보고 task fit, 위계, 타이포, 밀도, 상태 설명력을 판단한다. 갤러리 카드의 장식이나 문서 사이트의 단정함을 앱 화면의 품질과 혼동하지 않는다.
5. **화면별 적용:** 현재 `omd ref apply-plan --json`으로 초안을 받고, 근거를 보고 채운 뒤 `omd ref apply-set --input <application.json>`과 `omd ref apply-check --json`으로 발행·검증한다. 이 명령은 분석을 대신하지 않는다.
6. **작은 비교와 확장:** 필요할 때 대표 화면을 비교한다. 방향이 정해진 뒤 재사용할 토큰·컴포넌트를 확장하고 전체 범위로 진행한다.
7. **검사와 사용자 테스트:** 기존 기능·렌더·스트레스·슬롭 검증을 사용한다. P0-C를 구현하면 적용표까지 항목별로 연결한다. 개발 → Pi 적용 → 사용자 테스트 순서를 유지한다.

현재 저장 구조의 의미는 다음과 같다. 공통 적용표가 두 종류의 ID를 연결하는 것은 원본 리서치를 섞는 것과 다르다.

```text
.omd/
  refs/
    domain/                         도메인 캡처와 메타데이터
      research.json                 기능·업무·플로우 근거
    design/                         디자인 캡처와 메타데이터
      research.json                 시각 근거·관찰·선정 이유
      README.md                     디자인 미리보기
  reference-research.json            두 독립 조사 기록의 공통 인덱스
  reference-application.json         화면별 적용 계획; 두 종류의 참조 ID는 별도 필드
  reference-application.md           사람이 읽는 적용표
  reference-application-projection.json  제작자에게 전달하는 출처 제거 결정
```

위 파일은 현재 구현이다. P0-A의 실행 영수증, P0-C의 항목별 최종 검증, P1-E의 통합 검토 UI는 이 문서의 제안이며 이미 존재하는 명령이나 파일로 오해하면 안 된다.

## 7. 그대로 따라 하지 않을 것

- 도메인과 시각 근거를 같은 서비스로 채워 두 개를 확보했다고 하지 않는다. 사용자가 요청한 분리 정책을 유지한다.
- 유료 UI Bowl MCP를 무료 스크래핑으로 우회하려고 하지 않는다. 필요한 것은 허용된 증거의 획득이지 동일 서비스의 전 카탈로그 복제권이 아니다.
- Figma 결과가 좋은 인상을 준다는 이유로 OMD의 React·브라우저 경로를 Figma 전용으로 바꾸지 않는다.
- 모든 프로젝트에 똑같은 단계·시안 수·화면 수·상태 수를 적용하지 않는다. 기존 adaptive route와 정당한 생략 사유를 유지한다.
- primitive/semantic을 단순히 파일 두 개로 나누고 끝내지 않는다. 실제 적용 관계와 별칭이 중요하다. 현재 OMD의 token warning은 값 일치 중심이므로 의미 있는 토큰을 사용했다는 증명과는 구분해야 한다. [토큰 규칙](/Users/lyu/01_Project/01_Projects/OhMyDesign/core/rules/builtin/token.yaml:1)
- 장식용 아이콘을 매번 임의 SVG로 재제작하거나 외부 CDN을 무조건 필수로 만들지 않는다. 프로젝트의 기존 아이콘 체계·버전·라이선스·오프라인 요구에 맞춰 재사용한다.
- 이미지 생성 보류와 사용자 모델 선택을 바꾸지 않는다. 이번 분석 때문에 새 유료 서비스·모델·플러그인을 설치하지 않는다.
- 검증을 무겁게 추가하기만 하지 않는다. 하나의 현재 증거를 여러 검사가 재사용하고, 바뀐 입력이 영향을 주는 범위만 다시 검증한다.

## 8. 다음 개발 우선순위와 테스트 기준

| 순서 | 개발 단위 | 사용자가 확인할 변화 | 완료를 주장할 증거 |
| --- | --- | --- | --- |
| 1 | P0-A + P0-B: 실제 수집 증거 | 어느 사이트를 검색·방문했고, 무엇을 실제로 눌렀는지 보인다 | 성공·차단·정적 이미지·미방문을 구분한 네이티브 실행 기록; 조작 기록 없는 항목을 라이브 완료로 승격하지 않는 테스트 |
| 2 | P0-C: 적용 → 렌더 연결 | 레퍼런스에서 가져온 결정이 실제 어느 화면에 반영됐는지 보인다 | 현재 적용표/빌드/화면/상태에 연결된 항목별 결과; 변경·누락·과거 증거 재사용을 거부하는 테스트 |
| 3 | P1-D: 기존 UI 재사용 | `init` 이후 같은 컴포넌트와 상태를 안정적으로 확장한다 | 실제 import·props/variants·토큰 연결과 대표 렌더; 원본 보존 테스트 |
| 4 | P1-E/F/G: 검토 경험 | 원본·선택·반영·QA를 한눈에 보고 필요할 때만 시안을 고른다 | 소규모 실제 프로젝트를 Pi로 실행하고 사용자가 확인한 결과; 단순 문서 생성과 승인 표시의 분리 |

회귀 검증은 greenfield 앱 하나와 작은 기존 서비스 하나를 분리해 진행하는 것이 좋다. 이는 제안된 테스트 범위이며 이번에 실행한 결과가 아니다. 평가 항목은 검색/방문 근거 누락, 적용표 미검증 항목, 필요한 상태의 누락, 토큰·컴포넌트 이탈, 사용자 수정 요청의 원인으로 잡는다. 캡처 개수나 내부 점수만으로 좋은 디자인이라고 결론 내리지 않는다.

## 9. 이번 분석의 검증·한계

- 영상 자막 전체와 주요 시연 프레임 4곳을 확인했다. 세부 시각 요소는 영상 해상도로 읽을 수 있는 범위에 한정된다.
- 현재 OMD의 조사·적용·핸드오프·source seal·토큰 인벤토리·플로우·상태·스트레스·슬롭 검증 소스를 대조했다.
- 공개 하네스의 문서와 실제 게이트가 다를 수 있음을 확인했다. 그 하네스를 설치하거나 유료 MCP/Figma 시연을 재실행하지 않았다.
- 최신 OMD로 외부 사이트 수집부터 사용자 테스트까지 새 실전 실행을 한 것은 아니다. 테스트 통과와 미감·사용자 만족·실제 조사 수행은 별도다.
- 문서 작성 후 저장소 테스트·타입 검사·빌드 결과는 아래에 기록한다. 새 기능이 구현됐다는 의미가 아니라 분석 기준 코드의 회귀 확인이다.

검증 결과(2026-09-20):

- `npm test`: 2,697개 중 2,695개 통과, 실패 0개, 제외 2개.
- `npx tsc --noEmit`, `npm run build`, `git diff --check`: 통과.
- 문서의 로컬 파일 링크와 행 번호 범위: 확인 완료.
- 변경물은 이 분석 문서뿐이다. 하네스 실행 코드·스킬·기존 테스트 프로젝트·Pi 설치 상태는 변경하지 않았다.
