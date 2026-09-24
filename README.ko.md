# Oh My Design

**사람처럼 디자인하는 AI.** OMD는 디자인 요청을 질문, 근거, 대안, 실제 콘텐츠와 렌더 실험으로
이어갑니다. 모델은 필요한 방법을 선택하고, 관찰한 결과에 따라 기존 선택을 수정하거나
유지하거나 문제부터 다시 정의합니다.

[English](README.md)

## OMD로 만든 결과 — 원샷 프롬프트

OMD가 단일 원샷 프롬프트로 생성한 랜딩 페이지입니다 — 시각 출력은 손으로 다듬지 않았습니다. **[3x-haust.github.io/oh-my-design](https://3x-haust.github.io/oh-my-design/)** 에서 볼 수 있습니다.

## OMD란

여기서 ‘사람처럼 디자인한다’는 것은 특정한 결과 스타일이 아니라 근거를 남기는 판단을 뜻합니다. 목표는 반복 가능한 프로세스이며, 결과는 차분할 수도 과감할 수도 익숙하거나 낯설 수도 있습니다. 일관되는 것은 결과의 생김새가 아니라 그 뒤에 남은 결정의 흐름입니다.

[디자인 실행 계약](core/protocol/design-practice.md)이 선택된 작업 안에서 이 기준을 구체화합니다.
동작 검증과 사람 수준의 품질 주장은 구분합니다.
루트 `/docs/`의 조사·개발 메모는 로컬에 보관하며 저장소에서 추적하거나 공개하지 않습니다.

콘셉트 탐색은 내용에서 출발합니다. 하나의 강한 아이디어로 화면 전체를 구성할 수 있고,
서로 다른 안이 같은 브랜드 색을 사용할 수도 있습니다. 최종 페이지를 HTML과 CSS로 만들더라도
시각 초안은 방향을 고르는 데 쓸 수 있습니다. 구현 가능한 안들의 실제 디자인과 과업 적합성을
비교하며, 빌드나 초안 충실도 검사를 통과했다는 사실만으로 시각적 완성도를 판단하지 않습니다.

Oh My Design(OMD)은 코딩 에이전트가 요청을 받자마자 완성 화면으로 뛰어드는 흐름을 막습니다. 어떤 문제를 푸는지 먼저 묻고, 근거를 기록하고, 글과 레이아웃을 분리하고, 익명 구조를 비교하고, 구현자의 의도를 모르는 리뷰어가 실제 렌더를 비평합니다.

전체 흐름은 모든 단계를 강제하는 체크리스트가 아니라 적응형입니다.

```text
outcome + facts + risk → selected methods and reasoned skips → one production build
                       → real-surface interaction and visual evidence → causal repair or reframe
```

과업 중심 제품 작업은 과업 흐름 벤치마크, 시맨틱 진입 표면 계약, 소스에 결속된 브라우저
계획을 선택할 수 있고, 마케팅 작업은 다른 근거·카피·구성·모션 경로를 선택할 수 있습니다.
두 경우 모두 사용자가 고른 모델을 유지합니다. 평가 selector는 호출자가 준 정답표가 아니라
현재 과업 기록에서 유도하며, 정보가 부족한 그린필드 컨셉을 차별적으로 보이게 하려고 제품
기능을 창작하지 않습니다.

OMD는 **Codex**, **Claude Code**, 그리고 공개 **Pi extension API**를 구현한 호스트에서 동작합니다. 여섯 개의 사용자용 스킬, 아홉 개의 내부 파이프라인 에이전트, 로컬 `omd` CLI, 디자인 이론·레시피 팩, 그리고 `.omd/` 아래의 내구 프로젝트 기록을 제공합니다.

## 요구 사항

- **Node.js 22.19 이상** (CLI가 TypeScript 진입점을 직접 실행합니다)
- **Claude Code, Codex, 또는 Pi 호환 호스트**
- 브라우저 공급자: 두 지원 플랫폼에서는 **browser-rs v0.1.10**을 우선 사용하고, 렌더·프로브·타이포그래피 증명을 위해 **Playwright + Chromium** 폴백을 유지합니다(아래 참고).

## 설치

### npm — 전역 CLI (권장)

```bash
npm install -g @3xhaust/oh-my-design
oh-my-design install    # 감지된 모든 호스트에 스킬+에이전트를 복사하고 설정을 패치
oh-my-design doctor     # 호스트 설치 검증
omd doctor              # 런타임, Chromium, 프로젝트 쓰기 권한, 이론 팩 검증
```

`oh-my-design install --host claude|codex` 로 install·doctor·uninstall 을 한 호스트로 한정할 수 있습니다. `uninstall` 은 `install` 이 한 일을 정확히 되돌리며, `.omd/` 디렉터리는 절대 건드리지 않습니다. 호스트 설치 뒤에는 browser-rs도 시도하고 `present`, `installed`, `unsupported`, `failed`를 보고합니다. browser-rs가 실패해도 정상 OMD/Playwright 호스트 설치를 롤백하지 않습니다.

> 반드시 **스코프** 패키지 `@3xhaust/oh-my-design` 를 설치하세요. 스코프 없는 `oh-my-design` 은 무관한 다른 프로젝트입니다.

### Pi 호환 호스트 — extension package

OMD는 표준 Pi package입니다. Pi와 Senpi 같은 API 호환 fork는 동일한 extension과 canonical
skill을 로드합니다. OMD가 Senpi 실행 파일을 탐색하거나 별도 프로세스로 실행하지 않습니다.

```bash
pi install npm:@3xhaust/oh-my-design
```

호환 fork에서는 그 호스트의 package 설치 명령에 같은 npm package를 전달합니다. Extension은
프로젝트 doctor 검사용 `/omd`와 기존 OMD CLI를 구조화된 인자로 실행하는 `omd_cli` 도구를
등록합니다. 공개 Pi extension/package API만 사용하며 fork 전용 API에는 의존하지 않습니다.

Pi에서 `omd_cli`를 사용할 때 외부 activation 파일은 필요하지 않습니다. 라우트 입력은 먼저
`omd route validate --input .omd/.cache/route-input.json --json`으로 검사하고, 오류에 표시된
필드를 고친 다음 `route classify`로 저장합니다. 입력 오류를 인증 누락으로 처리하지 않습니다.

[3-Layer 실행 계약](core/protocol/three-layer-enforcement.md)은 **규칙 선언 → 단계·에이전트 절차 → 자동 차단**을 연결합니다.
코디네이터는 단계별 brief를 읽고 계약을 전달한 뒤 `omd brief <stage> --check --json`으로 진입을 검증합니다.
일반 `brief` 조회 성공은 진입 허가가 아닙니다. production 진입은 `guard production`과 같은 실검증을 사용하고,
라우트가 있는 프로젝트의 `recipe add`도 Pi 없이 CLI에서 모든 출력 경로를 쓰기 전에 검사합니다.
Pi의 공개 `tool_call`/`message_end` 훅은 앱 파일 `write`/`edit`와 임의 `bash`가 현재 설계 입력 검증을
통과해야 실행되도록 합니다. 리서치 입력·직접 소유한 설계 문서 작성은 계속 가능합니다. 최종 검증에 실패하면
검증되지 않은 완료 응답을 보류합니다. OMD 명령은 프로젝트별로 직렬화해 mutation lock 충돌을 줄입니다.
소스 작성을 시도한 턴의 수정 가능한 최종 실패는 작업 포인터나 작성된 증거가 바뀌는 동안 수정·재검사를 계속합니다.
같은 실패 상태가 두 번 연속 반복되면 루프를 멈추며, 권한 부족이나 사용자 중단은 자동 재시도하지 않습니다.
최종 메시지 교체 API는 Pi 0.85.1 기준이며,
fork도 단순한 `on` 함수뿐 아니라 같은 이벤트 반환 동작을 지원해야 합니다.
`/reload` 후 `/omd`로 확인하세요. 이벤트 훅이 없는 호스트는 CLI 검사만 가능하다고 표시합니다.
이는 OS 샌드박스나 미적 품질 보증이 아닙니다. 외부 프로세스·별도 쓰기 도구는 훅의 경계 밖이며,
스트리밍 초안은 최종 검증 전에 보일 수 있습니다. 독립 리뷰 권한을 임의로 만들지도 않습니다.
업데이트로 기존 build/skill 권한이 오래됐다면 원래 승인된 범위로 route validate/classify를 다시 실행해야
합니다. `stage status.completed`는 파일 존재 목록이지 검증 완료 목록이 아닙니다.

레퍼런스 조사는 **도메인**(`.omd/refs/domain/research.json`: 유사 서비스의 화면·기능·플로우)과
**디자인**(`.omd/refs/design/research.json`: 구성·타이포·밀도·컴포넌트)으로 따로 저장합니다.
`omd ref add <url> --as <name> --lane domain|design`으로 캡처 PNG와 메타데이터부터 각 폴더에
저장합니다. `ref add-batch`의 각 항목도 `lane`을 지정합니다. `ref list --lane domain|design --json`으로
따로 조회할 수 있으며, 도메인 캡처는 시각 디자인 보드에 자동으로 섞이지 않습니다.
`omd ref discover-plan --json`은 앱/제품 UI에 Mobbin·Page Flows·Pinterest·Dribbble·Behance(선택적으로 UI Bowl 공개 화면), 웹/마케팅에 Siteinspire·Pinterest
같은 탐색 후보를 제시합니다. 실제 무료 열람 가능한 항목만 사용하며, 막힌 출처는 다른 공개
출처로 대체합니다. 유료 결제·체험 시작·MCP 자동 설치는 하지 않습니다. 무료 열람과 재사용
권한은 별개입니다. 갤러리 이름만으로 품질을 인정하지 않고 원본 화면과 선택 이유를 기록합니다.
갤러리 작품은 `omd ref navigate <항목 URL> --lane design --json`으로 방문해 탐색 기록을 `.omd/discovery/design/`에 둡니다. 디자인 근거에는 연결된 원본 화면 또는 `omd ref add <항목 URL> --lane design --selector <img CSS>`로 선택한 실제 UI 이미지 요소만 저장합니다. 이미지 요소는 `omd ref import-image`로 시각 전용 근거로 등록한 뒤 보드에서 사용합니다. 자르기는 필수가 아니며 갤러리 바깥 화면은 디자인 폴더에 저장하지 않습니다.
`omd schema reference-research --json` → `omd ref research-set --input <input.json>` →
`omd ref research-check --json`으로 두 파일과 통합 일치 기록을 검증합니다. 갤러리 홈 주소만으로는
통과하지 않습니다. 개별 항목의 PNG·캡처 JSON과 원본 출처를 대조하고, 원본이 다른 페이지라면
갤러리에서 실제 관찰한 링크가 그 출처를 가리켜야 합니다. 검증기는 두 조사의 출처 호스트·최종
리다이렉트·이미지 중복도 거부합니다. 현재 v7 조사는 시장이 명시되면 출처별 시장 근거까지
기록하며 도메인/디자인 레인을 분리합니다. 별도 시장 지정이 없는 한국어 서비스 기획은 레퍼런스 조사에서 한국 서비스를 먼저 찾고 두 레인 모두 현지 근거를 요구합니다. 이 기본값은 국가별 미감을 추론하지 않습니다. 업무 페이지를 갤러리라고 이름 붙이거나 다른 영역을
캡처해 디자인 조사를 대신할 수 없습니다. 유료 UI Bowl MCP 없이 공개 항목으로 진행합니다.
디자인 자료는 `visual-direction`과 `component-support`를 구분하고 구성·타이포·밀도·이미지·
적용할 것·제외할 것을 기록합니다. 현재 v7은 서로 다른 서비스 계열과 갤러리 항목에서 수집한
시각 방향 자료가 2개 이상이어야 하며 PNG 바이트도 달라야 합니다. 두 방향 모두 현재 보드에
실제로 사용해야 하고, 추적 파라미터만 다른 URL·파일명만 바꾼 캡처·쓰지 않은 스크린샷은
개수에 포함하지 않습니다. 모든 보드 후보가 시각 방향 자료를 실제 사용해야 합니다.
미리보기와 선정 이유는 `.omd/refs/design/README.md`에서 확인합니다. 과거 v5는 검색 전용,
v6는 검색 또는 직접 공개 목록 계약으로 계속 읽을 수 있습니다. 유효한 캡처도 현재 검증과
마이그레이션이 허용할 때만 재사용하고, 과거 바이트를 새 기록으로 가장하지 않은 채 v7로 발행합니다.
자동 검증은 미적 품질의 인증이 아닙니다.

현재 v7에서는 검색어만 적어서는 통과하지 않습니다. `omd ref search --input <json>`에
`{lane, query, url, queryParam}`을 주면 새 브라우저의 실제 GET·관찰 링크·캡처·실패를 기록합니다.
반환된 영수증을 각 조사의 `searches`에 넣습니다. 모든 검색어는 실행 기록과 일치해야 하고,
선정한 비사용자 출처/갤러리 항목은 관찰 링크와 별도의 실제 방문 캡처로 이어져야 합니다.
실패 기록은 무료 대체 출처의 성공 기록과 함께 남길 수 있습니다. HTTP 200만으로 품질을 인정하지 않습니다.
검색 실행은 Google/Bing/DuckDuckGo 공개 검색 페이지와 `queryParam: "q"`를 사용합니다. 화면·패턴 키워드에
`site:pinterest.com/pin/` 같은 출처 조건을 조합하며, 업무 페이지에 임의 검색 파라미터를 붙인 것은 거부합니다.
검색이 차단되면 v6/v7은 `omd ref navigate`를 통한 서명된 직접 공개 목록 탐색도 허용합니다.
새 search-v2/direct-entry-v3 기록은 프로젝트 서명으로 변조를 탐지하지만, 제공자 인증이나
디자인 품질·시장 적합성·공식성의 인증서는 아닙니다.
명시된 시장의 로컬 근거로 쓰려면 서명된 검색 결과에서 해당 링크에 붙은 보이는 문구가 시장명과
관련 서비스/제품 범위를 직접 밝혀야 합니다. 검색어만 현지화했다고 로컬 출처가 되지는 않습니다.
이 시장 근거와 선정한 출처의 관찰 기록은 모두 7일 이내여야 합니다.
직접 공개 목록도 선택한 링크의 보이는 라벨에 같은 기준을 적용합니다. 목록의 다른 시장 헤더로
무관한 서비스를 로컬 출처로 만들 수 없습니다. 선언한 모든 시도와 선택한 보관 캡처는 7일 제한을
받고, global fallback 출처도 자신에게 도달한 서명된 검색/직접 탐색 영수증과 링크별로 결합됩니다.

조사 후 `omd ref apply-plan --json`으로 현재 도메인 브리프의 모든 화면에 대한 미완성 입력을
받습니다. 실제 이미지를 보고 `input`을 채운 뒤 `omd ref apply-set --input <application.json>`과
`omd ref apply-check --json`을 실행합니다. 화면마다 도메인/디자인 참조 ID, 직접/부분/브리프 기반
근거, 공백, 적용할 내용·옮기지 않을 내용·이유·실제 렌더에서 확인할 기준을 나눠 기록합니다.
사용자는 `.omd/reference-application.md`를 보고, 제작자는 brief/선택 핸드오프의 출처가 제거된
설계 결정만 받습니다. 조사나 화면 범위가 바뀌면 재검토해야 합니다. 유효한 v4 캡처는 재수집 없이
활용할 수 있지만 판단을 자동으로 채워주지는 않습니다. Design Flow Harness의 화면별 활용 방식을
적용한 것이며, 고정 Figma 순서나 새 승인 단계를 강제하지 않습니다. 계획은 구현·미감·승인 증명이 아닙니다.

이제 source-seal도 적용 계획을 묶습니다. 인증된 최종 증거 이후 `omd ref apply-review-plan --json`으로
모든 화면의 기준을 받아 현재 데스크톱·모바일 캡처와 대조하고, `apply-review-set --input <json>` →
`apply-review-check --json`으로 기록·검증합니다. 누락·수정 필요·오래된 판정은 완료를 막습니다.
계획·소스·빌드가 바뀌면 재봉인·재캡처·재검토해야 합니다. 에이전트 판정은 사용자 승인이 아닙니다.
적용 계획 v2에는 각 화면의 `target: {route, state}`도 기록합니다. 홈 캡처로 다른 화면을
검토할 수 없습니다. `omd schema reference-flow-input` → `omd benchmark record --input <flow.json>`은
같은 브라우저 문맥에서 공개 링크·펼침·탭 이동을 실행하고 단계별 캡처와 서명된 기록을 저장합니다.
선택된 제품 벤치마크의 완료 플로우는 이 기록이 필요합니다. `liveFlowVerified`는 실행된 범위에만
적용되며 로그인·결제·제출·삭제와 미방문 화면은 검증 완료로 바꾸지 않습니다.
검색 결과에서 관련 핀을 따라간 경우 각 조사 레인의 `navigation`에 중간 페이지의 네이티브 캡처를
넣습니다. 실제 관찰한 링크로 연결된 경로만 인정하며, 같은 사이트의 다른 페이지도 서로 다른 파일로 저장합니다.

기존 서비스는 프로젝트 폴더에서 `omd init --json`을 실행하면 현재 CSS 변수·선언과 `$value`
토큰 JSON을 `.omd/existing-design-system.json` 및 `.md`로 정리합니다. 테마·미디어쿼리 범위와
별칭, 출처 위치·해시를 보존하며 앱 코드·승인된 `.omd/tokens.json`은 변경하지 않습니다.
다음 작업의 brief가 이 자료를 전달합니다. `omd init --check`로 변경 여부를 확인하고,
변경 내용을 검토한 뒤 `omd init --refresh`로 갱신합니다. 의도적인 변경 결정은 별도
`.omd/design-system-decisions.md`에 남기며 재실행해도 보존합니다. Tailwind 설정·CSS-in-JS·
컴포넌트 변형은 정적 파일에서 추정하지 않습니다. 실제 계산값은 `omd schema runtime-design-inventory-input`의
로컬 빌드·선택자·화면 상태를 지정한 뒤 `omd init --input <input.json>`으로 수집합니다.
`.omd/runtime-design-system.json`과 `.md`에 컴포넌트/상태별 계산 스타일과 CSS 변수를 저장하고 다음 brief에서
재사용합니다. `init --check`는 소스·빌드·캡처 변경을 감지하고 `init --refresh`는 같은 범위를 다시 관찰합니다.
관찰한 utility/CSS-in-JS 스타일은 승인된 의미 토큰이나 미방문 변형의 증명이 아닙니다.

구현 완료 전에는 `omd schema slop-scope`의 실제 로컬 빌드 HTML·뷰포트 목록으로
`omd slop checkpoint --input <scope.json>`을 실행합니다. 저장된 화면을 보고 반환된 `reviewInput`에
각 후보·경고의 확인/제외 판단과 근거를 작성해 `omd slop review-set --input <review.json>`으로 저장합니다.
확인된 문제는 수정·재빌드 후 같은 범위를 재검사하고, 새 화면을 근거로 이전 문제의 해결을 기록합니다.
`omd slop review-check` 및 CLI finalize·완료 preflight는 누락·미처리·오래된 증거를 거부합니다.
경고 개수 자체를 오류로 승격하지 않으며, 최초 검사에서 문제가 없다면 가짜 수정 라운드는 필요 없습니다.
SPA 화면·모달·오류 상태는 각 뷰에 `state: {name,startRoute,route,actions,assertions}`를 추가합니다.
실제 동작 후 상태를 유지한 채 캡처·검사하고 최종 증거의 경로·상태·뷰포트와 대조합니다.
상태명만으로 통과하지 않으며 최종 인증 캡처의 뷰포트 픽셀과도 일치해야 합니다. 같은 테스트 데이터와
안정된 상태로 재현해야 하며, 검사·런타임 수집 기록은 서명으로 임의 재작성을 감지합니다.
외부 네트워크·API 쓰기는 차단하므로 로컬 번들/테스트 데이터가 필요합니다.
첫 렌더 검사는 `first-render check --page <local-build.html> --input <surface.json>`으로 현재
가설·소스·빌드·네이티브 캡처를 묶습니다. 단순 권고만으로 완료를 막지 않으며 비교 검사는 가설의
`comparisonRequired`가 참인 작업에만 적용합니다.

“실제 개발 전까지만” 요청은 `omd schema design-route-input`의 `deliveryMode: design-only`를
사용합니다. 출력은 `.omd/**`로 제한하고 레퍼런스 조사·설계·검토·핸드오프까지 진행합니다.
마지막에 `omd schema design-handoff`에 따라 문서 해시를 기록하고
`omd completion design-check --input .omd/design-handoff.json --json`으로 확인합니다.
이 검사는 문서 무결성·레퍼런스 증거·쓰기 범위를 검증하며, 앱 동작이나 리뷰어 독립성을 인증하지 않습니다.

### Claude Code — 플러그인 마켓플레이스

```text
/plugin marketplace add 3x-haust/oh-my-design
/plugin install oh-my-design@omd
```

이후 세션을 열고 `/ultradesign` 을 실행합니다.

### 소스에서 설치 (기여자)

```bash
git clone https://github.com/3x-haust/oh-my-design
cd oh-my-design
npm install
node bin/omd-install.ts install    # 감지된 호스트에 스킬+에이전트 복사
node bin/omd.ts doctor

# 전역 설치 없이 Pi에서 source extension을 시험합니다.
pi -e ./extensions/omd.ts
```

### 브라우저 공급자와 Chromium (전역 설치 후)

전역으로 `@3xhaust/oh-my-design`을 설치한 뒤 OMD는 대화형 레퍼런스 조사, 사용자가 지정한 영역 캡처, 시각 QA에서 `browser-rs` MCP 공급자를 우선합니다. 이는 의도적으로 범위를 좁힌 v0.1.10 통합이며, 모든 브라우저/사이트 호환성을 주장하지 않습니다.

| 플랫폼 | browser-rs 상태 | 정확한 SHA-256 |
| --- | --- | --- |
| Darwin arm64 | 지원됨. healthy일 때 기본 대화형 공급자 | `9a5895fc2f07b1010226d30f081d678fa2edcc15dd6f24cdf10074cfe1573749` |
| Linux x64 | 지원됨. healthy일 때 기본 대화형 공급자 | `792ca76e5ce0423968763556e110900a3aa65737fc6227724914aa137e972589` |
| 그 외 모든 플랫폼 | 지원하지 않으며 browser-rs를 내려받지 않음 | 아래 Playwright + Chromium 폴백을 사용합니다. |

설치된 OMD 관리 바이너리는 `receipt.json`과 함께 `$HOME/.local/share/oh-my-design/browser-rs/v0.1.10/browser-rs`에 놓입니다. OMD는 게시 전에 정확한 체크섬을 검증합니다. 탐색 순서는 `OMD_BROWSER_RS_BIN`, `PATH`의 `browser-rs`, 그 다음 receipt로 소유권이 확인된 이 관리 대상입니다. OMD는 외부 override/PATH 바이너리나 영수증이 없거나 변조된 관리 대상 파일을 덮어쓰지 않으며, `oh-my-design browser uninstall`은 OMD 소유이고 receipt·digest가 모두 맞는 바이트만 지웁니다.

```bash
# 명시적 공급자 수명주기. 선택한 공급자가 healthy가 아니면 doctor는 1로 끝납니다.
oh-my-design browser install
oh-my-design browser doctor --json

# 전역 패키지 설치 뒤에는 같은 목적의 자체 로컬 HTML fixture를 전달합니다.
oh-my-design browser smoke --fixture /absolute/path/to/local-probe.html --out /tmp/omd-browser-rs-smoke.png

# 외부·무영수증·변조 바이트는 삭제하지 않고 보존합니다.
oh-my-design browser uninstall
```

소스 체크아웃에서는 전역 bin을 가정하지 말고 검증된 TypeScript 진입점을 사용합니다.

```bash
node bin/omd-install.ts browser install
node bin/omd-install.ts browser doctor --json
node bin/omd-install.ts browser smoke --fixture test/fixtures/probe.html --out /tmp/omd-browser-rs-smoke.png
node bin/omd-install.ts browser uninstall
```

지원 플랫폼에서 browser-rs가 없거나, 소유권이 없거나, 불량이면 unhealthy입니다. 의도한 바이너리/소유권을 먼저 복구하거나 `OMD_BROWSER_RS_BIN`을 의도적으로 설정한 뒤 `browser doctor`를 다시 실행하세요. 지원하지 않는 플랫폼에서는 Playwright 모듈과 Chromium 폴백이 모두 준비된 경우에만 공급자 상태가 healthy입니다. browser-rs 초기화/기능 실패 뒤에는 기존 `omd render`와 `omd probe`가 결정적인 Playwright 폴백입니다.

설치 프로그램은 Chromium을 설치하지 않습니다. `omd doctor` 가 Playwright 부재나 Chromium 실행 파일 누락을 보고하면, 보고된 항목을 설치한 뒤 다시 확인합니다.

```bash
npm install -g playwright
npx playwright install chromium
node bin/omd.ts doctor
```

## 채팅 우선 LEGO 레퍼런스 조립

OMD는 전체 사이트 스타일을 복제하지 않고, 확정된 브리프에 맞춰 추적 가능한 레고 부품으로 레퍼런스를 선택합니다. 표준 순서는 다음과 같습니다.

```text
brief blocks → fragment inventory → brick analysis → candidate assemblies
→ selected assembly → clean-room composite → production usage ledger → final provenance report
```

인터페이스는 대화입니다. Codex/Claude는 후보 표와 최종 한/영 출처 표를 채팅에 직접 보여 줍니다. `omd-board` 실행 파일, DESIGN UI, HTML 보드, PNG 보드는 없습니다. 레퍼런스 보드는 검증된 내부 `.omd/reference-board.json` 기록이며, 패키지의 공개 bin은 `omd`, `oh-my-design`뿐입니다.

대화 뒤에서 에이전트는 컴포넌트를 캡처하고, 근거를 검증하고, 채팅용 후보를 만들고, 사용자의 채팅 선택을 결속할 수 있습니다.

```bash
# 에이전트 내부 작업입니다. 사용자는 결과 Markdown을 채팅에서 검토합니다.
omd ref add <url-or-local-page> --as <component> --selector '<css>' --blueprint --shot
omd ref import-image ./local-fragment-input.json
omd ref board --input candidate-assemblies.json
# 시장 근거형 라우트는 출처가 제거된 슬롯-결정 binding도 만들고 검사합니다.
omd ref locale-bind --input reference-locale-binding.json
omd ref locale-bind-check
omd ref check
omd ref candidates
omd ref select <candidate-id>
omd ref check
```

`omd ref candidates`는 출처 사이트/페이지, 캡처한 UI·이미지 부분, 제안 경로/컴포넌트, 가져올 점, 피할 점, 적용 방식을 담은 한국어 우선 Markdown 표를 출력합니다. 보드를 열지 않습니다. 선택은 검증된 원시 근거와 정제된 레퍼런스 조립 양쪽의 해시에 결속됩니다.

### 캡처, 클린룸 구성, 최종 추적성

짧은 독립 컴포넌트 예제를 빈 페이지로 오인하지 않도록, 지정한 HTML 요소의 렌더 크기·표시 스타일·텍스트를 확인합니다. 이 확인이 시각적 품질 판정은 아닙니다. HTTP 403·서버 오류·봇 확인 화면은 계속 거부합니다.

같은 컴포넌트의 데스크톱·모바일 관찰은 모두 보존하되 서로 다른 출처처럼 세지 않습니다. 상태 보존 캡처는 기존 포커스나 명시적으로 연 메뉴를 관찰하며, 측정하지 않은 인터랙션·모션은 미확인으로 남깁니다. 자세한 범위는 [캡처 프로토콜](core/protocol/reference-assembly.md#capturing-an-existing-state-or-open-disclosure)을 참고하세요.

모션 참고 수집은 백그라운드 요청이 계속되어도 로드된 컴포넌트를 관찰할 수 있습니다. 반환된 측정값에는 여전히 실제 화면 검토가 필요하며, 디자인 품질이나 접근성의 인증서는 아닙니다.

컴포넌트 부품은 selector로 범위를 정한 blueprint와 로컬 PNG입니다. Pinterest류 갤러리 및 유사 출처는 browser-rs로 **사용자가 지정한** 영역을 캡처하고 `omd ref import-image`가 그 로컬 PNG를 가져옵니다. 입력에는 절대 HTTP(S) `sourcePage`, 선택 `sourceImage`, 사람이 읽을 수 있는 `captureRegion`, 선택 `cropBox`, `licenseStatus`(`allowed`, `restricted`, `unknown`), 권리 메모, 시각 역할/원칙, 표준 provenance 시간이 기록됩니다. OMD는 원격 이미지를 스크래핑·핫링크·다운로드하거나 그 픽셀을 배포하지 않습니다.

composer는 정제된 선택 조립만 받습니다. 즉 전달 가능한 구조/원칙/geometry만 받고 출처 URL, **원본 selector**, provenance, 스크린샷, 로컬 출처 이미지, 원시 픽셀은 받지 않습니다. 구현에서 선택 부품을 목적지에 연결할 수 있도록 **대상 `targetSelector`**는 의도적으로 유지합니다. `.omd/reference-composite-lineage.json`에는 해시로 결속된 `generated` 클린룸 합성 또는 `unavailable` 이유가 기록됩니다. 호스트 이미지 생성이 가능하면 아직 풀리지 않은 디자인 질문에 맞춰 초안 수를 정하고 독립적인 컨셉을 병렬 생성해 비교할 수 있으며, 새 이미지 공급자나 API 키 계층은 추가하지 않습니다. 사용할 수 없으면 CSS/SVG/근거 폴백을 사용합니다. 기존 모션, `prefers-reduced-motion`, WebGL/3D 게이트는 변하지 않습니다.

구현 중에는 선택한 각 출처 부품이 `.omd/reference-usage.json`에서 `used`, `rejected`, `anti-reference` 행을 받습니다. `.omd/reference-report.md`와 최종 채팅 답변은 상태, 출처 사이트/페이지, 정확한 캡처 UI·이미지 영역, 배포 경로/컴포넌트/selector, 차용한 속성, 명시적으로 차용하지 않은 속성, 변환, 프로덕션 근거 경로·selector·검증 메모를 한/영 표로 제공합니다.

캡처·근거·출처 격리·적용 계약은 [레퍼런스 조립 프로토콜](core/protocol/reference-assembly.md)을 참고하세요.

### Codex에서 초기 시안 비교

디자인 방향이 아직 열려 있다면 `omd-codex`로 실행한 Codex에서 제공된 콘텐츠로 잠정 HTML 시안을 만들 수 있습니다. 전체 구성이 승인되기 전에도 데스크톱·모바일 렌더를 보며 어떤 배치가 내용을 더 잘 전달하는지 비교할 수 있습니다. 선택적으로 만드는 이 시안은 실제 제작물과 분리되며, 참고자료 조사·카피·조판 확인·최종 리뷰를 대신하지 않습니다. HTML 시안 기능이지 이미지 생성 서비스나 디자인 품질 보장은 아닙니다. 지원 호스트의 작업 방식은 [시안 프로토콜](core/theory/imagegen.md#provisional-source-studies)을 참고하세요.

## 실제 콘텐츠에 맞춘 디자인

일반적인 `/ultradesign` 사용에는 스타일 용어가 필요 없습니다. 실제 자사 콘텐츠에 안정된
형태가 있으면 OMD는 길이, 개수, 종횡비, 의미상 예외를 바탕으로 구성을 조정할 수 있습니다.
결과에는 무엇이 그대로 유지됐는지와 데스크톱 및 모바일 근거 경로를 보여 주는 읽기 전용
Fit Receipt가 포함됩니다. OMD는 원문 대신 해시, 프로젝트 상대 경로, 제한된 측정값을 저장하며,
말하지 않은 취향을 추론하지 않습니다. 관련 CLI 명령은 전문가와 디버깅을 위한 표면일 뿐,
일상 사용에 새 단계를 추가하지 않습니다.

## 실제로 의도한 언어와 시장에 맞춘 디자인

OMD는 로컬라이제이션을 문장 번역으로 보지 않고, 언어 코드를 국가 테마에 연결하지도 않습니다.
대화 언어와 화면 로케일, 명시한 시장, 사용자와 과업, 도메인, 화면 유형, 브랜드 불변 조건을
서로 분리합니다. `ja-JP`는 일본어 스크립트 역학의 근거가 될 수 있지만, 그 자체로 일본 시장의
미감을 허가하지 않습니다. bare `zh`가 중국 본토로 조용히 바뀌지 않으며, `zh-CN`과 `zh-TW`도
서로 다른 컨텍스트로 유지됩니다.

한국어로 작성된 서비스 기획은 별도 시장을 지정하지 않았다면 레퍼런스 조사에서 한국 서비스를
우선 탐색하는 근거로 사용할 수 있습니다. 이는 조사 대상의 기본값일 뿐 한국식 미감이나
문화 적합성을 확정하는 근거가 아닙니다.

일반적인 `/ultradesign` 사용에서는 화면 언어와 의도한 시장·사용자를 알려 주면 됩니다. 시장이나
사용자에 대한 권한 있는 정보가 빠졌다면 OMD가 한 번의 집중 질문을 하고, 그래도 해결되지 않으면
그 리서치 경로를 중단합니다. 로케일 컨텍스트의 `marketAuthorityClaimId`는 해당 시장을 실제로
명시한 사용자 근거가 있는 confirmed `evidenceClaims.userFacts` 항목을 가리켜야 합니다.
언어 역학 전용 경로는 실제 대상 언어 카피와 타입 역학을 검사하지만
문화 적합성을 주장하지 않습니다. 시장 근거형 경로는 명명된 결정마다 최신 표준, 동일 과업의
글로벌 대응 표면 또는 정확한 부재, 목표 시장의 현지 1차 카테고리 근거, 반례를 모읍니다.
`supported`/`shared` 메커니즘만 보존하고, 충돌은
`contested`, 근거 부족은 시각 규칙이 아닌 `unknown`으로 남깁니다.
비교 근거는 이름이 같은 기관의 일반 홈페이지가 아니라, 동일한 과업이나 카테고리를 제공하는
표면이어야 합니다. 대응 표면의 부재는 신뢰 범위를 낮출 뿐, 근거 수렴에 찬성표를 주지 않습니다.

전문가·디버깅용 표면입니다. 이 블록은 독립 quickstart가 아닙니다. 현재 라우트가 선택한 명령만
실행합니다. 호스트 런처가 `OMD_ACTIVATION_PATH`를 제공하고, 각 `omd schema` 명령은 입력 골격을
출력하며, source capture는 선언된 근거 출처마다 한 번씩 반복합니다.

```sh
omd schema locale-design-context
omd locale plan --input .omd/locale-design-context.json --json
omd route classify --input .omd/.cache/route-input.json \
  --locale-context .omd/locale-design-context.json \
  --activation "$OMD_ACTIVATION_PATH"
omd locale source-capture --url https://example.org/current-source \
  --activation "$OMD_ACTIVATION_PATH" --json
omd locale profile --publish --input cultural-profile.json \
  --activation "$OMD_ACTIVATION_PATH" --json
omd locale profile-check --activation "$OMD_ACTIVATION_PATH" --json
omd schema reference-locale-binding
omd ref locale-bind --input reference-locale-binding.json --json
omd ref locale-bind-check --json
```

프로필과 정제된 투영은 콘텐츠 주소화되며, 현재 출처 바이트, 대상 언어 타이포 증명, 라우트
컨텍스트, 브랜드 불변 조건에 결속됩니다. 프로덕션 역할은 출처 URL이나 국가 스타일 프롬프트가
아니라 출처가 제거된 투영만 받습니다. 에이전트 리뷰가 말할 수 있는 것은 근거 기반 적응까지입니다.
명시된 목표 사용자 집단의 실제 구성원에게 독립적인 블라인드 평가를 복수로 받지 않았다면, OMD는 결과가 문화적으로
토착적이거나 선호된다고 주장하지 않습니다.

시장 근거형 라우트가 레퍼런스 보드도 사용한다면 locale binding이 마지막 연결을 닫습니다.
각 현지 레퍼런스 슬롯은 자신이 구현하는 정확한 `supported` 또는 `shared` 프로필 결정을
지정해야 합니다. 긍정적 전달에는 캡처된 현지 카테고리 컴포넌트가 필수이며 동일 과업의
글로벌 출처를 함께 쓸 수 있습니다. anti-reference 전달에는 프로필이 인용한 반례가 필요합니다.
`contested`와 `unknown` 결정은 조용히 디자인 규칙으로 바뀔 수 없습니다. Composer, Hand, Eye는
출처가 제거된 슬롯-결정 투영만 봅니다. 출처 소유자 전용 ID와 캡처 해시는 이 downstream 역할에
공개되지 않은 채 근거 기록에 남습니다.

## 휴먼 디자인 루프

`omd-ultradesign` 은 아래 작업 중 해당되는 것만 조율합니다. 아래 목록은 전체 능력 지도이지
보편적인 순서가 아닙니다. 적응형 라우트가 선택한 단계·방법, 의존 순서, 생략한 선택 항목의
이유를 기록합니다.

1. **프리플라이트** — 프로젝트 디렉터리를 고정하고, `omd doctor` 를 실행하고, 저장소를 점검하고, Figma 브리프는 `omd-figma` 로 라우팅합니다.
2. **프레임** — 브리프를 캐물어 문제, 리프레임 가설, 주요 과업, 잦은 동작, 가장 비싼 오류를 근거와 함께 기록합니다.
3. **컨셉** — 생성자, 시각 레지스터, 타이포그래피 방향, 의도한 기억에 남을 순간을 정합니다.
4. **리서치** — 도메인, 경쟁자, 사용자 언어, 컴포넌트, 타이포그래피, 관련 모션에 걸쳐 측정된 레퍼런스를 모읍니다.
5. **카피 작성** — 전담 writer가 레이아웃 전에 사실 추적 가능한 카피 덱을 만듭니다.
6. **블라인드 카피 리뷰** — 새 리뷰어는 브리프·카피·사실 원장·보이스 근거만 보고, 렌더·코드·레이아웃·근거·작성자는 보지 못합니다.
7. **블라인드 타이포그래피 증명** — typesetter가 실제 카피 시편을 1280×900, 390×844에서 레이아웃 중립으로 렌더하고, 새 eye가 페이지 구조나 근거 없이 검토한 뒤 typesetter가 수정·재렌더합니다.
8. **의도적 구성** — 새 composer가 경험의 축, 하나의 지배적 초점, 매스·리듬, 합당한 메커니즘 캐리어 또는 명시적 대안, 반응형 재구성, 후보 축을 정의합니다. `omd composition --check` 가 입력 신선도를 검증합니다.
9. **구조적 발산** — 격리된 에이전트들이 동일한 컴포지션 계약을 받습니다. 일반 경로에서는 각 후보의 고정 데스크톱/모바일과 보조 전체 페이지 연속성 증거를 직접 렌더합니다. 정확한 후보 모션 장면이 호스트 근거 전용 계약을 사용하면 sketch는 그 하나의 프리프로덕션 장면만 구현하고, 모든 증거와 영수증은 호스트가 독립적으로 캡처합니다.
10. **블라인드 선택** — 새 selector가 고정된 여덟 개 0–4 차원을 채점하고, 계약 위반이나 2 미만인 차원을 거부하며, 폴드 위의 폼을 CTA 도달과 동일시하지 않습니다.
11. **한 번 구현** — 선택된 하나의 구조가 프로덕션 구현이 됩니다. builder는 또 다른 후보 집합을 만들지 않습니다.
12. **구현 중 성찰** — builder가 시맨틱 체크포인트를 기록하고, 선택된 데스크톱/모바일 컨테이너에서 타입을 다시 증명한 뒤, 선택적 모션 전에 비주얼 체크포인트를 기록합니다.
13. **결과 확인** — 데스크톱·모바일 렌더, 스퀸트 뷰, 해당되는 필름스트립, 결정적 검사, 선언된 로컬 프로브가 리뷰 근거를 제공합니다.
14. **소스 후보 분류** — 프로덕션 소스가 생긴 뒤 읽기 전용 스캔이 좁은 후보를 제안합니다. 코디네이터가 렌더 맥락으로 각각을 해소하며, 후보의 존재만으로는 실패가 아닙니다.
15. **비평·수리·리프레임** — 스퀸트 전용 glance가 위계를 먼저 보고하고, 별도의 날카로운 리뷰어가 크래프트와 정제된 후보를 판단한 뒤, 수리 결과를 렌더·검사·재스캔합니다.
16. **출하** — 프로젝트 테스트, 빌드 검사, 해당 디자인 게이트, 미해소 항목을 각각의 근거와 함께 보고합니다.

Figma 파일과 명시적 시각 타깃은 이미 구조적 결정을 제공하므로, 해당 경로에서는 구조적 발산을 건너뛸 수 있지만 그 이유를 기록합니다.

## 스킬

여섯 개의 사용자용 스킬입니다. 정본 이름은 `omd-` 접두사를 쓰며, Codex는 `(omd) <스킬>` 로 표시하고, Claude 마켓플레이스 플레이버는 `oh-my-design:<스킬>` 로 참조합니다.

| 스킬 | 용도 |
| --- | --- |
| `omd-ultradesign` | 페이지, 앱, 대시보드, 블로그, 랜딩 페이지, 리디자인을 위한 전체 휴먼 디자인 루프를 실행합니다. |
| `omd-figma` | Figma 파일을 가져와 시스템을 합성하고, 프레임을 구현하고, 반응형 쌍을 비교하고, 측정된 충실도를 보고합니다. |
| `omd-scout` | 디자인·구현 없이 측정된 LEGO 조각 인벤토리와 채팅용 Markdown 후보·사용 표를 만듭니다. 할당량을 채우는 대신 결정적 커버리지 공백을 메우고 불확실성을 보고합니다. |
| `omd-critique` | 기존 디자인을 바꾸지 않고 검토합니다. 결정적 발견을 근본 원인별로 묶고 렌더된 크래프트를 판단합니다. |
| `omd-humanize` | 사실을 보존하면서 건전한 담화를 국소적으로 수리하거나, 검증된 사실·보이스·표면 동작으로부터 뒤틀린 메시지를 재구성합니다. |
| `omd-coach` | 누적된 검사 이력을 읽고 반복되는 문제와 추세를 찾아 다음에 연습할 것을 제안합니다. taste 기록은 읽지 않습니다. |

## 내부 파이프라인 에이전트

아홉 개의 에이전트는 루프의 구현 세부이며 공개 명령이 아닙니다. 구체적 모델을 고정하지 않습니다. 기본적으로 사용자가 설정한 모델과 소스에 선언된 effort 단계를 사용합니다.

Codex 호스트 실행 한 번에 한해, 패키지 기본값을 바꾸지 않고 공식 역할별 모델과
`low`, `medium`, `high` effort를 사용자가 지정할 수 있습니다.

```bash
omd-codex exec -C /path/to/project \
  --model gpt-6-astra -c 'model_reasoning_effort="medium"' \
  --omd-role-model omd-eye=gpt-5.6-sol \
  --omd-role-effort omd-eye=high \
  --omd-role-model omd-hand=gpt-5.6-sol \
  --omd-role-effort omd-hand=medium \
  '$omd-ultradesign continue the current route'
```

매핑할 역할마다 두 호스트 전용 옵션을 반복합니다. 런처는 코디네이터를 시작하기 전에
이 비공개 옵션을 제거하고 현재 실행에 결속하며, 브로커만 매핑된 자식에 적용합니다.
매핑되지 않은 역할은 계속 모델 인자를 생략하고 에이전트 프로필의 effort를 유지합니다.
`omd-codex role run`과 `omd-codex owner run`은 이 옵션을 받지 않습니다.

| 에이전트 | 책임 | 쓰기 경계 |
| --- | --- | --- |
| `omd-framer` | 브리프를 캐묻고 근거 기반 프레임을 기록합니다. | 읽기 전용. frame CLI로 기록. |
| `omd-scout` | 파이프라인 커버리지를 위한 측정 근거를 리서치합니다. | 읽기 전용. reference CLI로 기록. |
| `omd-writer` | 카피 덱과 사실 원장을 쓰거나 수리합니다. | `.omd/copy-deck.md`만 직접 수정. |
| `omd-typesetter` | 구조 이전의 실제 카피 타이포그래피 증명을 만들고 수정합니다. | `.omd/type-proof.md`와 `.omd/.cache/type-proof/` 직접 수정. |
| `omd-composer` | 정제된 근거를 발산 전 신선한 컴포지션 계약으로 변환합니다. | `.omd/composition.md`만 직접 수정. |
| `omd-sketch` | 실제 카피가 담긴 격리된 그레이스케일 구조 후보 하나를 만듭니다. | 자신의 캐시 후보 디렉터리만. |
| `omd-hand` | 선택된 구조를 구현하고 두 개의 크래프트 체크포인트를 기록합니다. | 프로덕션 저장소와 선언된 OMD 기록. |
| `omd-glance` | 스퀸트 렌더만으로 위계를 보고합니다. | 쓰기 없음. |
| `omd-eye` | 익명 구조를 선택하거나, 카피·타이포 증명을 블라인드로 검토하거나, 날카로운 렌더를 비평합니다. | 쓰기 없음. |

Claude Code는 에이전트 메타데이터에 선언된 거부 도구를 강제할 수 있습니다. Codex 에이전트 파일에는 이에 해당하는 도구 제한 필드가 없어, 그곳의 읽기 전용 한계는 하드 샌드박스가 아니라 프롬프트 계약입니다. OMD는 이 계약을 파일시스템 격리라고 표현하지 않습니다.

## 근거 경계와 산출물

| 단계 | 내구 산출물 | 경계 |
| --- | --- | --- |
| Frame | `.omd/frame.md` | 주장은 사용자 문장, 리서치 라인, 데이터, 또는 명명된 관찰이 필요합니다. 내부 OMD 지시는 근거가 아닙니다. |
| Research | `.omd/refs/*.json` | builder는 모방할 스크린샷이 아니라 측정값과 원칙을 받습니다. 스카우팅은 보편적 캡처 수나 갤러리 할당량이 아니라 결정/컴포넌트 커버리지, 독립성, 출처 신뢰로 멈춥니다. |
| Copy | `.omd/copy-deck.md` | 출하되는 각 사실 주장은 `verified` 사실 ID를 가리킵니다. `fixture` 사실은 밀도만 테스트하고, `open` 사실은 출하 주장을 뒷받침할 수 없습니다. |
| 블라인드 카피 리뷰 | 리뷰 핸드오프 | 리뷰어는 렌더·소스·레이아웃·프레임·결정·작성자를 볼 수 없고 덱을 편집하지 않습니다. writer가 리뷰를 반영한 뒤 `omd copy --check` 를 다시 실행합니다. |
| 타이포그래피 증명 | `.omd/type-proof.md`; 시편은 `.omd/.cache/type-proof/` | 실제 대상 언어 카피가 역할, 출처/라이선스, 글리프 커버리지, 요청/계산된 패밀리·굵기, 축, 폴백/로딩, 줄바꿈/잘림, 거부된 대안을 두 뷰포트에서 증명합니다. 브라우저 증거는 각 글리프에 쓰인 물리적 폰트를 식별하지 못합니다. |
| 컴포지션 계약 | `.omd/composition.md` | 클린룸 composer가 정제된 근거를 받아 초점, CTA 경로, 메커니즘 캐리어/대안, 반응형 관계를 정의하며 폴드 위의 사진이나 폼을 요구하지 않습니다. 정확한 해시가 오래된 입력을 실패시킵니다. |
| 구조 스케치 | `.omd/.cache/sketches/<id>/` | 각 후보는 일반적으로 고정 1280×900, 390×844 수용 렌더와 전체 페이지 데스크톱/모바일 연속성 증거를 제공합니다. 명시적 호스트 근거 전용 장면 계약에서는 Sketch가 후보 소스만 쓰고, 모든 렌더·영수증·광학 기록·검사·패킷은 호스트가 소유합니다. 전체 페이지 캡처는 의존성/리듬만 알려줍니다. |
| 블라인드 선택 | `.omd/taste/preferences.jsonl` | selector는 익명 렌더와 정제된 과업 맥락만 보고, 후보 근거나 작성자는 보지 못합니다. `omd choose` 가 선택된 후보와 이유를 에이전트 선택으로 저장합니다. |
| 프로덕션 빌드 | 저장소 소스 | 하나의 builder가 선택된 하나의 구조를 구현하고 카피 덱을 보존합니다. 구현 이유는 `.omd/decisions.md` 의 `omd decision` 항목으로 별도 기록됩니다. |
| 프로덕션 근거 | `.omd/attribution.md` | builder가 출하된 토큰·모션·컴포지션·그래픽의 출처를 기록합니다. |
| 크래프트 체크포인트 | `.omd/craft.jsonl` | 선택된 시맨틱·비주얼 체크포인트가 관찰 기준, 렌더, 수정·유지·재정의 판단을 기록합니다. 명시적 판단은 PNG 바이트에 연결되며 최종 승인을 대신하지 않습니다. |
| 소스 후보 분류 | 원시 JSON은 `.omd/.cache/`; 근거는 `.omd/decisions.md` | `omd slop scan` 이 소스 발췌 없이 통제된 신호를 노출합니다. `needs-render` 는 과도기이며, 최종 미분류·needs-render 수는 모두 0입니다. |
| 렌더 리뷰 | 캐시 렌더, 필름스트립, 프로브 출력 | 스퀸트 리뷰어는 스퀸트 렌더만 봅니다. 날카로운 리뷰어는 정제된 과업 맥락과 측정 출력을 받되, builder의 근거는 받지 않습니다. |
| Reframe | `.omd/frame.md` 개정 | `omd frame reframe` 는 원래 프레이밍을 지우지 않고 렌더가 드러낸 것을 덧붙입니다. |
| 최종 소스 씰 | `.omd/source-seal.json` | `omd source --seal` 은 최종 카피/타입/컴포지션과 정렬된 프로덕션 소스 해시를 기록합니다. `--check` 는 시맨틱 충실도가 아니라 바이트 신선도만 증명합니다. |

사람 승인 체크포인트는 크래프트 체크포인트와 별개입니다. 프로젝트는 기본 `checkpoint: none` 이며, `.omd/config.json` 에서 concept·structure·둘 다를 켤 수 있습니다.

## 스택 라우팅

모든 builder는 동일한 우선순위를 따릅니다.

```text
명시적 사용자 요청
  > 기존 저장소 스택과 툴체인
  > 완전한 빈 그린필드에는 React + Vite + TypeScript
```

기존 바닐라 HTML은 기존 스택입니다. 인식되지 않는 패키지나 툴체인은 조사·보존되며 빈 저장소로 취급되지 않습니다. 새 그린필드에 순수 HTML은 사용자가 명시적으로 요청할 때만 씁니다. 그린필드 스캐폴드 의존성은 허용되지만, 기존 프로젝트에는 불필요한 의존성을 추가하지 않습니다.

## 검증 스택

OMD는 결정적 검사와 렌더 리뷰를 결합합니다.

| 레이어 | 명령과 근거 |
| --- | --- |
| 계약 | `omd copy --check` 는 덱 구조와 사실 참조를 검증합니다. `omd composition --check` 는 컴포지션 섹션과 입력 신선도를 검증합니다. `omd source --seal/--check` 는 시맨틱 충실도 주장 없이 최종 승인 입력/소스 바이트를 검증합니다. `omd design --check` 는 디자인 계약 커버리지를 검증합니다. |
| 타이포그래피 증명 | 레이아웃 중립 데스크톱/모바일 시편이 스케치 전에 실행되고, 선택 컨테이너 재증명이 시맨틱 구조 이후·비주얼 체크포인트 이전에 실행됩니다. 카피, 폰트/파일, 굵기/축, 컨테이너 폭 변경이 증명을 무효화합니다. |
| 렌더 근거 | `omd render` 는 기본으로 정확한 뷰포트를 캡처합니다. `--full-page` 는 보조 연속성 근거, `--squint` 는 그레이스케일·블러로 위계를 분리, `--filmstrip` 은 로드 시점 프레임을 캡처합니다. |
| 후보 승인 | `omd optical --input <raw.json> --json` 은 사각형 수집기와 독립적으로 저장된 원시 멤버 사각형에서 잘린 Q/I 합집합을 다시 계산합니다. `omd packet --check --input <packet.json> --json` 은 익명 리뷰 전에 모든 고정/전체 렌더, 완전한 캡처 영수증 투영, 뒤따르는 줄바꿈 없이 바이트가 정확히 `[]` 인 검사, 광학 보고서, 인터랙션 투영을 다시 해시하고 의미까지 검증합니다. |
| 인터랙션 | `omd probe` 는 선언된 안전한 로컬 계획만 실행하고 기대·탭 순서 실패를 보고합니다. |
| 소스 후보 | `omd slop scan [root] [--json]` 은 지원되는 프로덕션 소스를 쓰지 않고 읽습니다. 후보는 맥락적 분류가 필요하며 `omd check` 경고·점수·작성자 주장이 아닙니다. |
| 디자인 린트 | `omd check` 는 `system`, `a11y`, `slop`, `motion`, `ux` 조건을 평가합니다. 대비·터치 영역 규칙은 오류이고, slop과 기타 품질 하한 규칙은 그렇게 작성된 경우 경고입니다. 어떤 발견이든 1로 종료하므로 CI에서 쓸 수 있습니다. |
| 사이트 일관성 | `omd check --site <dir>` 또는 다중 페이지 위치 인자 검사가 페이지 간 래더·토큰 드리프트를 보고합니다. |
| 레퍼런스 거리 | 기본 `omd ref distance <page>` 는 자문용입니다. `omd ref distance <page> --selected --gate --json` 은 선택·사용된 측정 가능 슬롯을 대상 selector별로 비교해 현재 receipt를 기록하며, `0.6` 미만이거나 증거가 stale이면 비정상 종료합니다. 새 art-selected final-v2 배포에는 이 통과 receipt가 필요합니다. |
| Figma 충실도 | `omd figma pull`, `system`, `diff` 가 Figma 스냅샷을 측정된 구현 보고와 연결합니다. `export FIGMA_TOKEN=…` 이 필요하며, `omd doctor` 는 토큰 부재를 선택 사항으로 처리합니다. |
| 시각 타깃 | `omd target set <이미지-경로-또는-URL> --as <name>` 과 `omd target diff` 가 등록된 PNG 타깃에 대해 경계 있는 이미지 비교를 실행합니다. URL은 직접 HTTP(S) 이미지 URL이어야 합니다. |
| 성능 | `omd lighthouse <lighthouse-report.json>` 가 Lighthouse JSON 리포트를 성능 예산(기본값: 성능 ≥ 90, Core Web Vitals가 Google "good" 기준 이내)에 대해 게이트합니다. Lighthouse 실행은 사용자가(`npx lighthouse <url> --output=json`), OMD는 그 리포트를 게이트하고 위반 시 비정상 종료합니다. |

slop 발견은 품질 하한이자 경고이며, 디자인이 AI로 생성되었음을 증명하지 않습니다. 서면 오버룰은 의도를 기록하지만 발견을 억제하거나 명령 상태를 바꾸지 않습니다. 렌더 비평은 여전히 필요합니다 — 규칙 엔진은 광학적 균형, 컴포지션 리듬, 타이포그래피 크래프트, 또는 기억에 남을 순간이 컨셉의 것인지를 안전하게 판단할 수 없습니다.

## 인터랙션 적용성

카피 덱은 정확히 하나의 인터랙션 범위를 선언합니다.

| 범위 | 필요한 근거 |
| --- | --- |
| `stateful` | 주요·복구 카피, `.omd/probes/primary.json`, `.omd/probes/recovery.json`. 두 프로브 모두 실행됩니다. |
| `navigation-only` | 주요 카피와 주요 프로브. 복구 카피·프로브는 구체적 이유와 함께 `N/A`. |
| `static` | 주요 카피. 복구 카피와 두 프로브 모두 구체적 이유와 함께 `N/A`. |

로딩·빈·오류·성공·비활성·오프라인·복구 상태는 표면이 실제로 도달할 수 있을 때만 설계합니다 — 하네스는 체크리스트를 채우려고 가짜 상태를 더하지 않습니다. 프로브 계획은 명시적 기대가 있는 선언된 클릭·입력·키 단계를 쓰고, 로컬 파일과 localhost/loopback URL로 제한되며, 인증·원격·파괴적·미선언 동작을 거부합니다. OMD는 컨트롤을 스스로 찾아 자동으로 클릭하지 않습니다.

## 프로젝트 상태

내구적이고 검토 가능한 기록은 `.omd/` 바로 아래에 있습니다.

- `frame.md`, `copy-deck.md`, `type-proof.md`, `composition.md`, `source-seal.json`, `design.md`, `decisions.md`
- `attribution.md`, `motion-spec.md`, `craft.jsonl`, `config.json`
- `refs/*.json`, `reference-board.json`, `reference-locale-binding.json`, `reference-locale-binding-evidence.json`, `reference-selection.json`, `reference-composite-lineage.json`, `reference-usage.json`, `reference-report.md`, 선언된 `probes/*.json`, `taste/preferences.jsonl`, `history.jsonl`

생성된 IR, 렌더, 필름스트립, 스케치 후보, 프로브 결과, 스크래치 출력은 `.omd/.cache/` 아래에 있으며, 캐시를 지워도 디자인 의도가 사라지면 안 됩니다. `oh-my-design uninstall` 은 설치된 OMD 파일과 설정 변경을 제거하되 프로젝트의 `.omd/` 디렉터리는 보존합니다.

## CLI 레퍼런스

`node bin/omd.ts --help` 의 압축 지도입니다.

```text
omd ir <page> [-o file]
omd render <page> -o shot.png [--viewport WxH] [--full-page] [--squint] [--filmstrip]
omd probe <page> [--plan path] [--json] [--out path]
omd check [<page>|--ir file] [--json] [--category slop] [--no-log]
omd check --site <dir>
omd check <page1> <page2> ...
omd slop scan [root] [--json]
omd coach
omd composition --check [--json]
omd source --seal [root]  |  omd source --check [root] [--json]

omd frame show
omd frame set --problem P --reframe R --why EVIDENCE [--task T --frequent-action A --costliest-error E]
omd frame reframe --to "..." --because "..."
omd frame generator --set "metaphor"
omd choose c1 c2 --chose c2 --why "..."
omd decision "what" --why "why"
omd taste record "subject" --kind selection|praise|rejection|overrule --evidence "verbatim" --from-user
omd taste profile [--all]
omd config set checkpoint none|concept|structure|both  |  omd config show
omd craft checkpoint semantic|visual --render path --observed "..." --decision revise|retain|reframe --criterion "..." --reason "..." [--changed "..."]
omd craft status [--json]

omd ref add <url|file> --as <component> [--selector "css"] [--image] [--blueprint]
omd ref list  |  omd ref distance <page> [--selected [--gate]] [--json]
omd ref principles <source> --as <component> --add "..."
omd ref show <source> --as <component>
omd ref board --input candidate-assemblies.json
omd ref locale-bind --input reference-locale-binding.json  |  omd ref locale-bind-check [--json]
omd ref check [manifest] [--json]
omd ref import-image <input.json> [--json]
omd ref candidates [manifest]                 # 채팅용 한국어 우선 Markdown, 보드 UI 없음
omd ref select <candidate-id> [--json]

omd design  |  omd design --check
omd copy --check [--json]
omd pack dir | list | <relpath>
omd doctor

omd figma pull <file-url>  |  omd figma system  |  omd figma diff <frame-id> <page-or-url>
omd target set <image-path-or-url> --as <name>  |  omd target list  |  omd target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]
```

## 아키텍처와 기여

프롬프트 원본:

- `src/agents/*.agent.yaml`
- `src/skills/omd-*/SKILL.md`

생성 산출물 — **직접 편집하지 마세요.** `npm run build` 가 직접 호스트와 플러그인 패키징용으로 재생성합니다:

- `agents/`, `skills/`, `dist/`

직접 편집하는 경로: `core/`, `bin/`, `adapters/`, `test/`, `evals/`, `scripts/`, `README.md`, `README.ko.md`, 그리고 `core/` 아래 이론·레시피 팩.

변경을 제출하기 전에:

```bash
npm test
npx tsc --noEmit
npm run build
```

새 린터 규칙은 좁게 유지하고, 양성·음성 테스트를 포함하며, 항상 경고 심각도를 사용합니다.

## 한계와 신뢰

- 프롬프트는 절제된 워크플로를 정의하지만, 실제 프로젝트 근거·쓸 만한 카피·렌더 검사·프로젝트별 검증 없이는 강한 디자인을 보장하지 않습니다.
- 프로브는 로컬·비인증·비파괴 경로를 위한 것이며, 범용 브라우저 자동화 계층이 아닙니다.
- 레퍼런스 거리, 린트, 이미지 diff는 측정값입니다. 판단을 대체하지 않고 정보를 줍니다.
- 플러그인/마켓플레이스 매니페스트는 배포되는 산출물이며, install→doctor 회귀 테스트가 다루는 경로는 소스 기반 직접 설치입니다.

[MIT License](LICENSE) 로 배포됩니다.
