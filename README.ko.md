<div align="center">

<h1>oh-my-design</h1>

**사람처럼 디자인한다. 훈련 데이터의 평균처럼 말고.**

<p>
<a href="https://github.com/3x-haust/oh-my-design/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/3x-haust/oh-my-design?style=flat-square" /></a>
<a href="https://github.com/3x-haust/oh-my-design/releases"><img alt="Release" src="https://img.shields.io/github/v/release/3x-haust/oh-my-design?style=flat-square" /></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
<img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522.18-brightgreen?style=flat-square" />
</p>

<a href="#-이게-뭔가">이게 뭔가?</a>
·
<a href="#-설치">설치</a>
·
<a href="#-스킬">스킬</a>
·
<a href="#-슬롭-린터">슬롭 린터</a>
·
<a href="./README.md">English</a>

<br />

</div>

<hr />

> [!NOTE]
> **2023년 이후 AI가 만든 랜딩페이지는 전부 닮았다. 인디고 그라디언트, 똑같은 카드 세 장, 제목 옆 로켓 이모지. `omd`는 그걸 린트 에러로 만든다.**

## 💤 이게 뭔가?

[DesignPref](https://arxiv.org/abs/2511.20513)에서 프로 디자이너 스무 명이 UI를 12,000번 짝지어 비교했다. 일치도는 **크리펜도르프 α = 0.248**에 그쳤다. "좋은 디자인"의 보편적 보상 함수는 존재하지 않는다. 그래서 평균 취향에 최적화된 모델이 익명적인 결과물을 내놓는 건 버그가 아니라 *목적 함수의 논리적 귀결*이다.

`omd`는 Claude Code와 Codex에서 도는 디자인 스킬이다. 더 좋은 모델이 되려 하지 않는다. 사람 디자이너가 밟는 루프를 밟고, 모델이 틀리는 부분을 기계가 잴 수 있는 것으로 바꾼다.

> ESLint를 생각하면 된다. 다만 룰셋이 "이거 AI가 만든 것 같은데"이고, 모든 룰은 서면 사유가 있으면 뒤집을 수 있다.

프롬프트 하나로는 못 하는 다섯 가지:

1. **평균을 검출한다.** 슬롭은 체크 가능하다. 정확하지만 익명적인 작업에 발화하고, 관점 있는 작업엔 침묵하는 결정론적 룰.
2. **관점을 강제한다.** 컨셉 은유가 모든 결정을 거른다. 정직한 회계사는 통통 튀지 않고, 새벽 3시 편의점은 여백을 남기지 않는다.
3. **실물에서 안전하게 배운다.** 측정값은 들어오고 픽셀은 절대 안 들어온다. 스크린샷을 본 모델은 그걸 다시 그리지만, 숫자를 받은 모델은 배운다.
4. **렌더된 걸 실제로 본다.** 대비율, 터치 영역, 모션 타이밍을 headless 브라우저에서 계산하지, 추정하지 않는다.
5. **작업을 연구에 접지한다.** 색, 타입, 레이아웃, 모션, UX 결정은 내장 이론 팩을 인용한 뒤에 내려진다.

## 🚀 설치

`omd`는 두 호스트에서 돈다. 인스톨러 하나가 둘 다 덮는다. `~/.claude`와 `~/.codex`를 감지해 각각에 플러그인을 복사하고 config를 패치한다.

```bash
oh-my-design install
```

`oh-my-design uninstall`은 install이 한 일을 정확히 되돌리고, `.omd/` 기록은 건드리지 않는다. `--host codex`로 한 호스트만 지정할 수 있다.

각 호스트의 마켓플레이스를 쓰는 길도 있다.

**Claude Code**

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

스킬은 `/`가 붙어 들어온다. `/omd:ultradesign`, `/omd:scout`.

**Codex**

```
codex plugin marketplace add 3x-haust/oh-my-design
```

그다음 `/plugins`를 열어 `omd`를 설치한다. 스킬은 `$`가 붙고(`$omd:ultradesign`, `$omd:scout`), 파이프라인의 네 에이전트는 GPT-5.6 세대로 해석된다. (마켓 매니페스트는 Codex 플러그인 스펙에 맞게 방출되지만, 끝까지 검증된 길은 `oh-my-design install`이다.)

어느 쪽이든 Node 22.18 이상이 필요하고, 첫 `omd render`가 headless Chromium을 Playwright로 알아서 받아온다. `omd` CLI는 어디서나 똑같다. `omd check`, `omd render`, `omd pack`은 어느 호스트가 불렀는지 상관하지 않는다. 설치 상태는 이렇게 확인한다.

```bash
omd doctor
```

체크당 한 줄. Node, Playwright, 브라우저 바이너리, `.omd/` 쓰기 권한, 이론 팩. `omd:ultradesign`은 매번 이걸 먼저 돌려서, 망가진 환경이 5단계째가 아니라 첫 1초에 죽게 한다.

## ⚡ 스킬

| 스킬 | 이렇게 말하면 | 이렇게 된다 |
| --- | --- | --- |
| `omd:ultradesign` | "디자인해줘", "랜딩 쩔게 만들어줘" | 루프 전체가 승인 요청 없이 끝까지 돈다. 동작하는 사이트와 함께, 모든 결정과 그 이유가 기록으로 남는다. |
| `omd:figma` | figma.com 링크를 붙여넣거나 "피그마 그대로 구현해줘" | 파일을 가져와 디자인 시스템을 합성하고, 프레임별 픽셀 비교 루프로 짓고, 반응형 쌍을 맞추고, 충실도 리포트와 함께 납품한다. |
| `omd:scout` | "레퍼런스 수집해줘", "좋은 사이트들은 X를 어떻게 해?" | 측정된 레퍼런스 보드. 전체 페이지, 단일 컴포넌트, 타이포와 모션 스터디, 커뮤니티 스레드, 실제 프로덕트의 *글투*까지. 디자인은 하지 않는다. |
| `omd:critique` | "비평해줘", "왜 이 화면 별로지" | 손대지 않고 리뷰한다. 린터를 돌리고, 발견을 근본 원인으로 묶고, 취향이 아니라 프로젝트 자신의 컨셉에 대고 판단한다. |
| `omd:humanize` | "AI티 빼줘", "사람이 쓴 것처럼" | 한국어와 영어 AI 문체 틱을 걷어낸다. 번역투, 기계적 나열, 상투구, 균일한 리듬. 사실은 한 글자도 바꾸지 않는다. |
| `omd:coach` | "내가 뭘 반복해서 틀리지?" | 체크 히스토리를 읽는다. 뭐가 반복되고, 뭐가 나아졌고, 뭘 공부할지. 데이터가 얇으면 추세를 지어내지 않고 그렇다고 말한다. |

## 🔁 파이프라인

`omd:ultradesign`은 일곱 단계를, 사이에 게이트 없이, 순서대로 돈다.

```
                         ┌──────────────────────────────────────────────┐
                         │                                              ▼
  ① 프레임 ──▶ ② 컨셉 ──▶ ③ 레퍼런스 ──▶ ④ 커밋 ──▶ ⑤ 빌드 ──▶ ⑥ 관찰 ──▶ ⑦ 리프레임
   브리프를      이론 팩 +    omd-scout이     구조 하나,    omd-hand     필름스트립    본 것이
   의심한다      도메인       실물을 잰다     비용 명명     + 모션 스펙  + 측정        프레임을
                리서치                                                               다시 쓴다
```

네 에이전트는 의도적으로 격리되어 있다. `omd-framer`는 브리프를 심문하고, 프레임을 고정하는 UX 질문 셋을 던진다. 사용자가 들고 오는 과제, 가장 잦은 액션, 가장 비싼 실수. `omd-scout`은 레퍼런스를 잰다. `omd-hand`는 커밋된 구조 하나를 짓는다. `omd-eye`는 맨 컨텍스트에서 비평하며, 픽셀을 판단하기 전에 주 과제를 직접 밟아본다. 작업을 낳은 추론을 본 적이 없으니 그걸 변호할 수도 없다.

가는 길에, 결과물을 흔한 빌드와 갈라놓는 네 가지가 있다.

- **scout은 AI가 만든 레퍼런스를 거른다.** 모든 캡처가 빌드가 통과해야 할 그 슬롭 린터를 먼저 지난다. 발화 2건이면 보드에 못 올라오고, 떨어진 캡처는 대체 검색을 의무로 남긴다. 보드는 *통과한 것*으로 만들지, 있던 것으로 만들지 않는다. 서로 0.85 이상 닮은 레퍼런스 쌍은 근친으로 떨궈진다. 그렇게 닮은 페이지들은 같은 평균을 실어 나른다.
- **eye는 스크린샷이 아니라 움직임을 본다.** `omd render --filmstrip`이 첫 몇 초를 프레임으로 찍고, 라이브 프로브가 로드와 스크롤 중 `document.getAnimations()`를 읽어 등장 타이밍과 스크롤 안무를 숫자로 만든다. hand는 모션 스펙을 먼저 쓰고, 스펙에 없는 애니메이션은 실리지 않는다.
- **모션, 구도, 그래픽은 즉흥이 아니라 쿡북에서 온다.** 모션 레시피 12종, 페이지 구도 8종, 그래픽 6종. 각각 동작하는 코드, 언제 쓰는지 조건, 보드 측정값이 채우는 슬롯을 갖는다. 즉흥은 평균으로 수렴하지만, 검증된 레시피를 파라미터화하는 건 그러지 않는다.
- **모든 토큰에 출처가 남는다.** `.omd/attribution.md`가 토큰 그룹마다 어느 레퍼런스나 이론에서 왔는지 기록하고, `omd check`가 감사한다. 아무도 출처를 못 대는 색은 감성이 아니라 발견이다.

## 🧹 슬롭 린터

`omd check`는 대비, 터치 영역, 간격, 토큰 커버리지를 재고, **슬롭**, 즉 평균으로 수렴한 작업의 시그니처를 잰다. 룰 스물한 개, 전부 warn이다. 각각이 의도된 선택에 대해 틀릴 수 있어서고, 뒤집으려면 서면 사유가 필요하다. 두 계열로 나뉜다.

**색·표면·레이아웃**, 기계의 디폴트 미학을 측정한다.

| 룰 | 잡는 것 |
| --- | --- |
| `SLOP-GRADIENT` | 인디고에서 바이올렛으로 흐르는 그라디언트를 hex 블록리스트가 아니라 색상 대역으로 |
| `SLOP-GRADIENT-TEXT` | 그라디언트 제목 텍스트. 스케일 대신 `background-clip`으로 위계를 흉내 |
| `SLOP-RADIUS-MONOCULTURE` | 모든 모서리가 한 radius. 재질 위계가 없다 |
| `SLOP-NESTED-RADIUS` | 안 맞물리는 모서리. 안쪽 radius는 바깥에서 패딩을 뺀 값이어야 한다 |
| `SLOP-SHADOW-MONOCULTURE` | 같은 그림자의 반복. 전부 떠 있으면 아무것도 떠 있지 않다 |
| `SLOP-OVERSIZED-SHADOW` | 작은 요소에 40px 넘는 blur. 장식이 된 그림자 |
| `SLOP-GLASSMORPHISM` | 최대 radius에 `backdrop-blur` 반투명. 구조가 아니라 흐림으로 만든 깊이 |
| `SLOP-EVERYTHING-CENTERED` | 강조가 아니라 디폴트가 된 가운데 정렬 |
| `SLOP-TRIPLE-CARD` | 똑같은 카드 세 장, 또는 대문자 통계 그리드. 뭐가 중요한지 아무도 결정 안 했다 |
| `SLOP-NESTED-CARDS` | 카드 안의 카드 안의 카드. 한 영역엔 한 표면 |
| `SLOP-MONO-SPACING` | 모든 간격이 하나. 습관이 아니라 관계로 띄운다 |
| `SLOP-FLAT-TYPE` | UI 전체가 14에서 18px 사이. 대비 없는 스케일 |
| `SLOP-BADGE-SPAM` | 크롬에 붙은 "Beta / New / Hot" 알약 |
| `SLOP-FAKE-STAT` | 지어낸 통계 줄. 출처 없는 `10k+ / 99.9% / 24/7` |
| `SLOP-EMOJI-HEADING` | 타이포그래피가 못 한 일을 대신하는 이모지. 제목이든 버튼이든 |

**카피**, 생성된 작업이 가장 먼저 자백하는 곳.

| 룰 | 잡는 것 |
| --- | --- |
| `SLOP-COPY` | "Unlock the power of…", "이건 단순한 X가 아니라 Y다". 어느 제품에나 맞는 카피 |
| `SLOP-COPY-KO` | 한국어 AI 문체 틱. 접속어 뒤 쉼표, "~를 살펴보겠습니다", 첫째/둘째 나열 |
| `SLOP-KO-EMDASH` | 한글 카피 속 띄어쓴 엠대시. 번역 문장부호의 수입 |
| `SLOP-KO-REGISTER-MIX` | 한 문단에서 흔들리는 해요체와 합니다체 |
| `SLOP-KO-SIGNPOST` | 문서 구조를 낭독하는 카피 ("아래는 그 기록이에요") |
| `SLOP-PINK-ELEPHANT` | "잡동사니 없이"라고 시키면 모델은 *"잡동사니가 없습니다"*라고 쓴다. 자기부정 메타카피 |
| `SLOP-LEAKED-RATIONALE` | 페이지 카피와 설계 노트가 다섯 단어 이상 겹침 |

슬롭 너머, 프롬프트만으로는 강제할 수 없는 것들도 같은 엔진이 감사한다.

| 계열 | 잡는 것 |
| --- | --- |
| `MOTION-*` | `prefers-reduced-motion` 없는 애니메이션, 레이아웃 속성 스래시, 균일한 500ms ease-in-out 시그니처, 스펙이 약속했는데 렌더에 없는 모션 |
| `UX-*` | 한 화면에서 두 버튼이 동시에 최상위를 주장 |
| `DESIGN-*` | 필수 섹션이 빠진 `.omd/design.md`, 에러 상태 어포던스가 없는 폼 |
| `ATTR-*` | `.omd/attribution.md`에 출처 없이 실린 토큰 그룹 |
| `SITE-*` | 페이지 간 드리프트. 한 페이지는 4단 타입 스케일, 다른 페이지는 6단 (`omd check --site`) |
| `FOCUS-*` | 눈에 보이는 포커스 표시가 없는 탭 스톱. 라이브로 프로브 |

실물로 캘리브레이션했다. 룰들은 *정확하고 접근성 있고 익명적인* 픽스처에 발화하고, 같은 내용에 관점이 실리면 침묵하며, linear.app은 잡지 않는다. `omd check`는 발견이 있으면 exit 1이라, 그대로 **CI 디자인 린터**가 된다.

## 📚 이론 팩

색은 제품에 대한 주장이고, 이론 팩은 그 주장의 근거가 사는 곳이다. 아홉 파일이 `core/theory/`로 내장되며, 각 항목은 조건에서 선택으로, 선택에서 이유로 쓰이고 실명 출처가 붙는다. Elliot & Maier, Bringhurst, Müller-Brockmann, Nielsen, NN/g, Baymard.

| 파일 | 답하는 질문 |
| --- | --- |
| `color.md` | 도메인별 색 관습과 그 이유, 조화 스킴, 60-30-10, 채도의 레지스터 신호, 다크모드 감채도 |
| `typography.md` | 스케일 비율의 의미, 페어링 이론, 한글 타이포그래피(행간, 국·영 혼용, Pretendard 대 Noto 기준) |
| `layout.md` | 게슈탈트의 UI 번역, 위계 도구 우선순위, 폼 연구, 빈·로딩·에러 상태, 정보 밀도 |
| `motion.md` | 지각 연구 기반 지속시간 임계값, 이징 의미론, 안무, 스켈레톤 대 스피너 근거 |
| `components.md` | 버튼 위계 상한, 검증 타이밍, 내비게이션, 테이블, 모달과 그 대안, 토스트, 검색 |
| `craft.md` | 이론서가 건너뛰는 것. 여러 겹 그림자, 보더 없는 구분, 투명도 계층 텍스트, 옵티컬 정렬, 60fps 안전 속성 |
| `expressive.md` | 어워드 사이트 해부학. Awwwards 배점표에서도 유저빌리티가 크리에이티비티를 이긴다. 내러티브로서의 스크롤, 절제 조항이 붙은 기법 카탈로그 |
| `ux.md` | 과제 우선 프레이밍, 내비게이션과 플로우, 피드백과 Doherty 임계값, 인지 부하와 점진적 공개, 첫 실행과 빈 상태, 피크엔드 설계, 체크 가능한 질문으로 바꾼 Nielsen 휴리스틱 |
| `voice.md` | 사람이 쓴 웹 카피가 실제로 어떻게 읽히는가. 문장 길이 분산, 앞에 싣기, 하나의 어체, 리뷰 마이닝. 측정된 사람 기준선에 맞춰 보정 |

컨셉 단계는 방향을 정하기 전에 이걸 읽는다. hand는 보드가 커버하지 않는 결정마다 이걸 인용한다. 인용 없는 선택은 발견이다.

## 📐 디자인 계약

한 페이지를 넘는 무엇이든, `omd design`이 `.omd/design.md`를 쓴다. 모든 서피스를 지배하는 지속적인 14섹션 계약이다. 브랜드 성격, 제품 목표, 페르소나, 정보 구조, 디자인 원칙, 비주얼 언어, 컴포넌트 인벤토리, 접근성 목표, 반응형 브레이크포인트, **인터랙션 상태(로딩·빈·에러·성공·비활성·오프라인)**, 콘텐츠 보이스, 구현 제약, 열린 질문. 리포지토리에 이미 있는 증거(`package.json`, 토큰 파일, `.omd/frame.md`, `.omd/refs/`)를 스캔해 채우고, 채울 수 없는 건 임의값 대신 명시적 열린 질문으로 남긴다.

`omd check`는 계약이 있으면 검증한다. `DESIGN-INCOMPLETE`는 빠진 섹션과 상태를 하나도 안 적은 인터랙션 상태 섹션에 발화하고, 에러 상태 없는 폼은 `DESIGN-FORM-NO-ERROR`를 단독으로 띄운다.

## 🏗 아키텍처

```
src/
  agents/                  소스 오브 트루스: framer, scout, hand, eye
  skills/                  소스 오브 트루스: ultradesign, figma, scout, critique, humanize, coach
core/
  theory/                  9파일 이론 팩
  motion/                  모션 레시피 12종 + 이징 어휘
  composition/             페이지 구도 레시피 8종
  graphics/                CSS-only 그래픽 6종
  craft/                   마감 패스 체크리스트
  design/                  디자인 계약 + 인터랙션 상태 룰
  ref/                     레퍼런스 측정, 블루프린트, 근친 검사, signal + slop 스코어링
  render/                  headless Playwright: 렌더, 필름스트립, 모션·hover·focus 프로브
  rules/                   린터 엔진 + 내장 룰 (slop, motion, ux, a11y, tokens)
  figma/                   파일 pull, 디자인 시스템 합성, 픽셀 diff, 반응형 매칭
  target/                  일반 시각 타깃 루프 (목업·스크린샷·URL 무엇이든)
  site/                    페이지 간 드리프트 비교
  install/                 Claude·Codex 호스트 감지 + config 패치
adapters/build.ts          src/에서 agents/, skills/, dist/, 두 호스트 매니페스트를 생성
evals/                     플러그인 eval 케이스 + 루브릭 그레이더
scripts/bump.ts            명령 하나, 모든 매니페스트, 드리프트 제로
.omd/                      프로젝트별 디자인 기록
  frame.md                 현재 이해하고 있는 문제
  design.md                다면 디자인 계약
  decisions.md             이 제품에 왜 초록색이 없는가
  attribution.md           각 토큰이 어느 레퍼런스에서 왔는가
  motion-spec.md           무엇이, 언제, 누구의 권위로 움직이는가
  refs/*.json              측정된 레퍼런스 + 기록된 원칙
  history.jsonl            모든 체크 실행. omd:coach가 읽는 것
```

`npm run build`가 `src/`에서 `agents/`, `skills/`, `dist/`, 두 호스트 매니페스트를 재생성한다. 생성된 디렉토리는 절대 직접 수정하지 않는다.

## ⌨️ CLI

```
omd design                                     repo 증거를 스캔해 .omd/design.md 생성·갱신
omd design --check                             design.md 섹션 커버리지 검증
omd check  <page> [--json] [--viewport WxH]    린트: a11y, 토큰, 모션, ux, 슬롭. 발견 시 exit 1
omd check  --site <dir>                         페이지 간 사다리·토큰 드리프트
omd render <page> -o shot.png [--filmstrip]     headless 스크린샷, 또는 첫 몇 초의 프레임
omd ir     <page>                               렌더된 DOM에서 측정된 노드 트리로
omd ref    add|list|show|principles|distance    레퍼런스 보드 (캡처 시점에 슬롭 스코어링)
omd frame  set|show|reframe|generator           문제 기록. 아무도 서명하지 않고, 루프가 다시 쓴다
omd decision "무엇" --why "왜"                  후임자가 고마워할 이유 파일
omd figma  pull|system|diff                     Figma 파일에서 스냅샷, 디자인 시스템, 픽셀 diff 루프로
omd target set|diff|list                        빌드를 목업·스크린샷·URL 무엇으로든 수렴
omd pack   dir|list                             이론·레시피 팩이 사는 곳 (호스트 무관)
omd doctor                                      환경 사전 점검
omd coach                                       반복되는 약점, 정직한 추세
```

## 🪨 정직한 한계

- 루프의 규율은 프롬프트가, *측정*은 코드가 강제한다. 모델은 조언을 무시할 수 있지만 대비율을 조작할 수는 없다.
- 슬롭 룰은 휴리스틱이다. 브랜드가 정말 바이올렛일 수 있다. 그래서 warn이고, 뒤집으려면 서면 사유가 필요하다.
- 모션 프로브는 CSS와 Web Animations를 본다. GSAP 같은 rAF 기반 라이브러리는 안 보여서, 필름스트립의 픽셀 에너지 패스가 그걸 받쳐주고, 각자 어디서 멈추는지 문서에 적어뒀다.
- 레퍼런스 캡처는 공개 페이지를 실제 브라우저로 읽고 **측정값과 추론만** 저장한다. 에셋은 절대. 연구하는 사이트를 존중할 것.
- 두 호스트는 코드베이스 하나를 공유하고, 팩 해석은 호스트 무관이다(Claude 전용 env var이 아니라 `omd pack dir`). 두 flavor 모두 테스트가 덮는다. `oh-my-design install` 경로는 끝까지 검증됐고, Codex 마켓 매니페스트는 문서 스펙에 맞지만 실 마켓 인스턴스에서 돌려본 적은 아직 없다.

## 📄 라이선스

MIT
