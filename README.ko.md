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
> **2023년 이후 AI가 만든 랜딩페이지는 전부 닮았다 — 인디고 그라디언트, 똑같은 카드 세 장, 제목의 로켓 이모지. `omd`는 그걸 린트 에러로 만든다.**
>
> ```
> /plugin marketplace add 3x-haust/oh-my-design
> /plugin install omd@oh-my-design
> ```

## 🚀 설치

Claude Code에서:

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

스킬은 `omd:ultradesign`, `omd:scout`처럼 네임스페이스가 붙는다. Node 22.18 이상 필요. 첫 `omd render`가 Playwright로 headless Chromium을 알아서 설치한다.

### 설치 확인

```bash
omd doctor
```

체크당 한 줄 — Node 버전, Playwright, 브라우저 바이너리, `.omd/` 쓰기 권한, 이론 팩. `omd:ultradesign`은 매 루프 시작 전에 이걸 조용히 돌린다. 망가진 환경은 5단계째가 아니라 1초 만에 드러나야 하니까.

### 제거

```
/plugin uninstall omd@oh-my-design
```

## ⚡ 스킬

| 스킬 | 이렇게 말하면 | 이렇게 된다 |
| --- | --- | --- |
| `omd:ultradesign` | "디자인해줘", "랜딩 쩔게 만들어줘" | 루프 전체가 승인 요청 없이 끝까지 돈다. 동작하는 사이트와 함께, 모든 결정과 그 이유가 기록으로 남는다. |
| `omd:figma` | figma.com 링크를 붙여넣거나 "피그마 그대로 구현해줘" | 파일을 가져와 디자인 시스템을 합성하고, 프레임별 픽셀 비교 루프로 짓고, 반응형 쌍을 맞추고, 충실도 리포트 테이블과 함께 납품한다. |
| `omd:scout` | "레퍼런스 수집해줘", "좋은 사이트들은 X를 어떻게 해?" | 측정된 레퍼런스 보드 — 전체 페이지, 단일 컴포넌트, 타이포·모션 스터디, 커뮤니티 스레드, 그리고 실제 프로덕트의 *글투*까지. 디자인은 하지 않는다. |
| `omd:critique` | "비평해줘", "왜 이 화면 별로지" | 손대지 않고 리뷰한다. 린터를 돌리고, 발견을 근본 원인으로 묶고, 취향이 아니라 프로젝트 자신의 컨셉에 대고 판단한다. |
| `omd:humanize` | "AI티 빼줘", "사람이 쓴 것처럼" | 한국어·영어 AI 문체 틱을 걷어낸다 — 번역투, 기계적 나열, 상투구, 균일한 리듬. 사실은 한 글자도 바꾸지 않는다. |
| `omd:coach` | "내가 뭘 반복해서 틀리지?" | 체크 히스토리를 읽는다: 뭐가 반복되고, 뭐가 나아졌고, 뭘 공부할지. 데이터가 얇으면 추세를 지어내지 않고 그렇다고 말한다. |

## 루프를 쓰는 법

### 1. "디자인해줘" 한 마디로 루프 전체가 돈다

프레임 → 컨셉 → 레퍼런스 → 빌드 → 관찰 → 리프레임. 승인 게이트도, "진행할까요?"도 없다. 스킬은 브리프부터 의심한다 — 초보와 전문가 디자이너의 가장 큰 측정된 차이는 전문가가 문제를 풀기 전에 문제를 의심한다는 것이다. 그 다음 컨셉 은유 하나에 걸고 끝까지 짓는다. 프레임, 결정, 이유 전부가 `.omd/`에 남는다.

### 2. scout은 실제 사이트를 재고 — AI가 만든 사이트는 거른다

레퍼런스는 **스크린샷이 아니라 측정값**으로 들어온다: 간격 사다리, 타입 스케일, 모션 지속시간, 이징 어휘. 그림을 보여주면 모델은 그걸 다시 그리고(Jansson & Smith, 1991), 숫자를 주면 배운다.

그리고 웹의 점점 큰 몫이 AI가 만든 페이지라서, 모든 캡처는 빌드가 통과해야 할 그 슬롭 린터를 입구에서 먼저 통과한다. 발화 2건이면 보드에 못 올라오고, 떨어진 캡처는 대체 검색을 의무로 남긴다 — 보드는 *통과한 것*으로 만들지, 있던 것으로 만들지 않는다. 서로 0.85 이상 닮은 레퍼런스 쌍에는 근친 경고가 뜬다: 그렇게 닮은 페이지들은 같은 평균을 실어 나른다.

### 3. eye는 스크린샷이 아니라 움직임을 본다

정지 PNG로는 죽은 페이지와 안무된 페이지를 구분할 수 없다. `omd render --filmstrip`이 첫 몇 초를 프레임 띠로 찍고, 라이브 프로브가 로드와 스크롤 중에 `document.getAnimations()`를 읽는다 — 등장 타이밍과 스크롤 안무가 숫자가 된다. hand는 빌드 전에 모션 스펙을 쓰고, 스펙에 없는 애니메이션은 실리지 않는다.

### 4. 모든 토큰에 출처가 남는다

`.omd/attribution.md`가 디자인 토큰 그룹마다 어느 레퍼런스, 어느 이론 항목에서 왔는지를 기록하고, `omd check`가 그걸 감사한다. 아무도 출처를 못 대는 색은 감성이 아니라 발견(`ATTR-MISSING`)이다.

<hr />

## 💤 이게 뭔가

[DesignPref](https://arxiv.org/abs/2511.20513)에서 프로 디자이너 스무 명이 UI를 12,000번 짝지어 비교했다. 일치도는 **크리펜도르프 α = 0.248**. "좋은 디자인"의 보편적 보상 함수는 존재하지 않는다 — 그래서 평균 취향에 최적화된 모델이 익명적인 결과물을 내놓는 건 버그가 아니라 *목적 함수의 논리적 귀결*이다.

> ESLint를 생각하면 된다. 다만 룰셋이 "이거 AI가 만든 것 같은데"이고 — 모든 룰은 서면 사유가 있으면 뒤집을 수 있다.

더 좋은 모델을 기다리는 건 과녁이 다르다. 대신 만들 수 있는 것:

1. **평균을 검출한다.** 슬롭은 체크 가능하다 — 정확하지만 익명적인 작업에 발화하고, 관점 있는 작업엔 침묵하는 결정론적 룰.
2. **관점을 강제한다.** 컨셉 은유가 모든 결정을 거른다: 정직한 회계사는 통통 튀지 않고, 새벽 3시 편의점은 여백을 남기지 않는다.
3. **실물에서 안전하게 배운다.** 측정값은 들어오고, 픽셀은 절대 안 들어온다.
4. **렌더된 걸 실제로 본다.** 대비율, 터치 영역, 모션 타이밍은 계산하지, 추정하지 않는다.
5. **색과 타입을 이론에 접지한다.** 컨셉 단계는 내장 이론 팩을 읽고 도메인 리서치를 돌린 뒤에 커밋한다 — 결정에는 취향이 아니라 인용이 붙는다.

## 🔁 파이프라인

```
                         ┌──────────────────────────────────────────────┐
                         │                                              ▼
  ① 프레임 ──▶ ② 컨셉 ──▶ ③ 레퍼런스 ──▶ ④ 커밋 ──▶ ⑤ 빌드 ──▶ ⑥ 관찰 ──▶ ⑦ 리프레임
   브리프를      이론 팩 +    omd-scout이     구조 하나,    omd-hand     필름스트립    본 것이
   의심한다      도메인       실물을 잰다     비용 명명     + 모션 스펙  + 측정        프레임을
                리서치                                                               다시 쓴다
```

네 에이전트는 의도적으로 격리되어 있다: `omd-framer`는 브리프를 심문하고, `omd-scout`은 레퍼런스를 재고, `omd-hand`는 커밋된 구조 하나를 짓고, `omd-eye`는 맨 컨텍스트에서 비평한다 — 작업을 낳은 추론을 본 적이 없으니 그걸 변호할 수도 없다.

## 🧹 슬롭 린터

`omd check`는 대비, 터치 영역, 간격, 토큰 커버리지를 재고 — **슬롭**, 즉 평균으로 수렴한 작업의 시그니처를 잰다. 룰 스물한 개, 전부 warn이다. 각각이 의도된 선택에 대해 틀릴 수 있어서고, 뒤집으려면 서면 사유가 필요하다. 세 계열로 나뉜다.

**색·표면·레이아웃** — 기계의 디폴트 미학을 측정한다:

| 룰 | 잡는 것 |
| --- | --- |
| `SLOP-GRADIENT` | 인디고→바이올렛 그라디언트 — hex 블록리스트가 아니라 색상 대역으로 |
| `SLOP-GRADIENT-TEXT` | 그라디언트 제목 텍스트 — 스케일 대신 `background-clip`으로 위계를 흉내 |
| `SLOP-RADIUS-MONOCULTURE` | 모든 모서리가 한 radius: 재질 위계가 없다 |
| `SLOP-NESTED-RADIUS` | 안 맞물리는 모서리 — 안쪽 radius는 바깥에서 패딩을 뺀 값이어야 한다 |
| `SLOP-SHADOW-MONOCULTURE` | 같은 그림자의 반복 — 전부 떠 있으면 아무것도 떠 있지 않다 |
| `SLOP-OVERSIZED-SHADOW` | 작은 요소에 40px 넘는 blur — 장식이 된 그림자 |
| `SLOP-GLASSMORPHISM` | 최대 radius + `backdrop-blur` 반투명: 구조가 아니라 흐림으로 만든 깊이 |
| `SLOP-EVERYTHING-CENTERED` | 강조가 아니라 디폴트가 된 가운데 정렬 |
| `SLOP-TRIPLE-CARD` | 똑같은 카드 세 장 — 또는 대문자 통계 그리드: 뭐가 중요한지 아무도 결정 안 했다 |
| `SLOP-NESTED-CARDS` | 카드 안의 카드 안의 카드 — 한 영역엔 한 표면 |
| `SLOP-MONO-SPACING` | 모든 간격이 하나: 습관이 아니라 관계로 띄운다 |
| `SLOP-FLAT-TYPE` | UI 전체가 14–18px 사이 — 대비 없는 스케일 |
| `SLOP-BADGE-SPAM` | 크롬에 붙은 "Beta / New / Hot" 알약 |
| `SLOP-FAKE-STAT` | 지어낸 통계 줄: 출처 없는 `10k+ / 99.9% / 24/7` |
| `SLOP-EMOJI-HEADING` | 타이포그래피가 못 한 일을 대신하는 이모지 — 제목이든 버튼이든 |

**카피** — 생성된 작업이 가장 먼저 자백하는 곳:

| 룰 | 잡는 것 |
| --- | --- |
| `SLOP-COPY` | "Unlock the power of…", "이건 단순한 X가 아니라 Y다" — 어느 제품에나 맞는 카피 |
| `SLOP-COPY-KO` | 한국어 AI 문체 틱: 접속어 뒤 쉼표, "~를 살펴보겠습니다", 첫째/둘째 나열 |
| `SLOP-KO-EMDASH` | 한글 카피 속 띄어쓴 엠대시 — 번역 문장부호의 수입 |
| `SLOP-KO-REGISTER-MIX` | 한 문단에서 흔들리는 해요체와 합니다체 |
| `SLOP-KO-SIGNPOST` | 문서 구조를 낭독하는 카피 ("아래는 그 기록이에요") |
| `SLOP-PINK-ELEPHANT` | "잡동사니 없이"라고 시키면 모델은 *"잡동사니가 없습니다"*라고 쓴다 — 자기부정 메타카피 |
| `SLOP-LEAKED-RATIONALE` | 페이지 카피와 설계 노트가 다섯 단어 이상 겹침 |

슬롭 너머, 프롬프트만으로는 강제할 수 없는 것들도 같은 엔진이 감사한다:

| 계열 | 잡는 것 |
| --- | --- |
| `MOTION-*` | `prefers-reduced-motion` 없는 애니메이션, 레이아웃 속성 스래시, 균일한 500ms ease-in-out 시그니처 |
| `ATTR-*` | `.omd/attribution.md`에 출처 없이 실린 토큰 그룹 |
| `SITE-*` | 페이지 간 드리프트: 한 페이지는 4단 타입 스케일, 다른 페이지는 6단 (`omd check --site`) |
| `FOCUS-*` | 눈에 보이는 포커스 표시가 없는 탭 스톱 — 라이브로 프로브 |

실물로 캘리브레이션했다: 룰들은 *정확하고 접근성 있고 익명적인* 픽스처에 발화하고, 같은 내용에 관점이 실리면 침묵하고, linear.app은 잡지 않는다. `omd check`는 발견이 있으면 exit 1 — 그대로 **CI 디자인 린터**다.

## 📚 이론 팩

색은 제품에 대한 주장이고, 이론 팩은 그 주장의 근거가 사는 곳이다. 일곱 파일이 `core/theory/`로 내장되고, 각 항목은 조건 → 선택 → 이유 구조에 실명 출처가 붙는다 — Elliot & Maier, Bringhurst, Müller-Brockmann, Nielsen, NN/g:

| 파일 | 답하는 질문 |
| --- | --- |
| `color.md` | 도메인별 색 관습과 그 이유; 조화 스킴; 60-30-10; 채도의 레지스터 신호; 다크모드 감채도 |
| `typography.md` | 스케일 비율의 의미; 페어링 이론; 한글 타이포그래피 — 행간, 국·영 혼용, Pretendard vs Noto 기준 |
| `layout.md` | 게슈탈트의 UI 번역; 위계 도구 우선순위; 폼 연구; 빈 상태·로딩·에러; 정보 밀도 |
| `motion.md` | 지각 연구 기반 지속시간 임계값; 이징 의미론; 안무; 스켈레톤 vs 스피너 근거 |
| `components.md` | 버튼 위계 상한, 검증 타이밍, 내비게이션, 테이블, 모달과 그 대안, 토스트, 검색 |
| `craft.md` | 이론서가 건너뛰는 것: 여러 겹 그림자, 보더 없는 구분, 투명도 계층 텍스트, 옵티컬 정렬, 60fps 안전 속성 |
| `expressive.md` | 어워드 사이트 해부학 — Awwwards 배점표에서도 유저빌리티가 크리에이티비티를 이긴다; 내러티브로서의 스크롤; 절제 조항이 붙은 기법 카탈로그 |

컨셉 단계는 방향을 정하기 전에 이걸 읽는다. hand는 보드가 커버하지 않는 결정마다 이걸 인용한다 — 인용 없는 선택은 발견이다.

## 🏗 아키텍처

```
src/
  agents/                  소스 오브 트루스: framer, scout, hand, eye
  skills/                  소스 오브 트루스: ultradesign, scout, critique, humanize, coach
core/
  theory/                  7파일 이론 팩 (dist/로 배포)
  ref/                     레퍼런스 측정, 근친 검사, signal + slop 스코어링
  render/                  headless Playwright: 렌더, 필름스트립, 모션·hover·focus 프로브
  rules/                   린터 엔진 + 내장 룰 (slop, motion, a11y, tokens)
  site/                    페이지 간 드리프트 비교
adapters/build.ts          src/에서 agents/, skills/, dist/, .mcp.json을 생성
evals/                     플러그인 eval 케이스 + 루브릭 그레이더
scripts/bump.ts            명령 하나, manifest 셋, 드리프트 제로
.omd/                      프로젝트별 디자인 기록
  frame.md                 현재 이해하고 있는 문제
  decisions.md             이 제품에 왜 초록색이 없는가
  attribution.md           각 토큰이 어느 레퍼런스에서 왔는가
  motion-spec.md           무엇이, 언제, 누구의 권위로 움직이는가
  refs/*.json              측정된 레퍼런스 + 기록된 원칙
  history.jsonl            모든 체크 실행 — omd:coach가 읽는 것
```

`npm run build`가 `src/`에서 `agents/`, `skills/`, `dist/`, `.mcp.json`을 재생성한다. 생성된 디렉토리는 절대 직접 수정하지 않는다.

## ⌨️ CLI

```
omd design                                                      레포 증거 스캔 → .omd/design.md(디자인 계약) 생성·갱신
omd design --check                                              design.md 섹션 검증; 누락 시 DESIGN-INCOMPLETE
omd check  <page> [--json] [--category slop] [--viewport WxH]   린트: a11y, 토큰, 모션, 슬롭, 인터랙션 상태. 발견 시 exit 1
omd check  --site <dir>                                         페이지 간 사다리·토큰 드리프트
omd render <page> -o shot.png [--filmstrip]                     headless 스크린샷, 또는 첫 몇 초의 프레임들
omd ir     <page>                                               렌더된 DOM → 측정된 노드 트리
omd ref    add|list|show|principles|distance                    레퍼런스 보드 (캡처 시점에 슬롭 스코어링)
omd frame  set|show|reframe|generator                           문제 기록 — 아무도 서명하지 않고, 루프가 다시 쓴다
omd decision "무엇" --why "왜"                                  후임자가 고마워할 이유 파일
omd figma  pull <figma-url>                                     Figma 파일 수신·정규화 → .omd/figma/snapshot.json + 반응형 쌍
omd figma  system                                               스냅샷에서 디자인 토큰·컴포넌트 인벤토리 추출
omd figma  diff <frame-id> <page> [--json]                      Figma 익스포트 vs. 빌드 렌더 픽셀 비교; 불일치 셀 리포트
omd doctor                                                      환경 사전 점검 (figma 명령 시 FIGMA_TOKEN 확인 포함)
omd coach                                                       반복되는 약점, 정직한 추세
```

### 디자인 계약

`omd design`은 `.omd/design.md`를 만든다 — 멀티 페이지 빌드의 모든 서피스 결정을 다스리는 열네 섹션짜리 지속 계약이다. 브리프가 제품이나 서비스를 설명할 때는 스카우트 전에 실행한다. 단일 일회성 페이지에서는 선택 사항 — 핸드백에서 그 이유를 밝히면 된다.

계약은 브랜드 성격, 제품 목표, 페르소나, IA, 디자인 원칙, 비주얼 언어, 컴포넌트 인벤토리, 접근성 타깃, 반응형 브레이크포인트, **인터랙션 상태(로딩 / 빈 상태 / 에러 / 성공 / 비활성 / 오프라인)**, 콘텐츠 보이스, 구현 제약, 열린 질문을 담는다. 레포에 이미 있는 증거(`package.json`, 토큰 파일, `.omd/frame.md`, `.omd/refs/`)는 스캔해서 채우고, 나머지는 발명된 값 대신 명시적 열린 질문이 된다.

`omd check`는 계약이 있을 때 검증한다. 누락된 섹션과 인터랙션 상태가 전혀 열거되지 않은 섹션에는 `DESIGN-INCOMPLETE`가 뜬다. 에러 상태 없는 폼은 design.md 유무와 관계없이 `DESIGN-FORM-NO-ERROR`가 잡는다.

## 🪨 정직한 한계

- 루프의 규율은 프롬프트가, *측정*은 코드가 강제한다. 모델은 조언을 무시할 수 있다 — 대비율을 조작할 수는 없다.
- 슬롭 룰은 휴리스틱이다. 브랜드가 정말 바이올렛일 수 있다. 그래서 warn이고, 뒤집으려면 서면 사유가 필요하다.
- 모션 프로브는 CSS와 Web Animations를 본다. rAF 기반 라이브러리(GSAP)는 안 보이고, 문서의 해당 자리에 그렇게 적어뒀다.
- 레퍼런스 캡처는 공개 페이지를 실제 브라우저로 읽고 **측정값과 추론만** 저장한다. 에셋은 절대. 연구하는 사이트를 존중할 것.
- Codex CLI 지원은 트리에 있지만 Claude Code 경로만큼 실전 검증되지 않았다.

## 📄 라이선스

MIT
