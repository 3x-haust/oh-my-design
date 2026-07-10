# oh-my-design (omd)

[English](./README.md) | **한국어**

**코딩 에이전트가 학습 데이터의 평균이 아니라, 사람처럼 디자인하게 만든다.**

AI가 만든 인터페이스는 고장나는 일이 거의 없다. 고장보다 나쁘다 — *정확한데 익명이다*.
인디고에서 바이올렛으로 흐르는 그라디언트. 똑같은 그림자를 얹은 기능 카드 세 장.
전부 가운데 정렬. 로켓 이모지로 시작하는 제목. "Unlock the power of."

버그가 아니다. 관점 없는 모델이 내놓는 필연적인 결과다 — 지금까지 본 모든 것의
평균값. `omd`는 이 실패를 **측정 가능하게** 만들고, 그 위에서 사람 디자이너가 실제로
도는 루프를 돌린다: 문제를 의심하고, 컨셉을 정하고, 실물 레퍼런스를 연구하고, 하나만
제대로 짓고, 렌더된 걸 눈으로 보고, 본 것이 문제 정의를 다시 쓰게 한다.

```
① FRAME ─▶ ② CONCEPT ─▶ ③ REFERENCE ─▶ ④ COMMIT ─▶ ⑤ BUILD ─▶ ⑥ SEE ─▶ ⑦ REFRAME ─┐
   문제를      은유를        실물을          구조 하나,     짓는다      렌더하고     본 것이 문제를 │
   의심한다    고른다        측정한다        비용 명시                  측정한다     다시 쓴다     │
      ▲                                                                                       │
      └───────────────────────────────────────────────────────────────────────────────────────┘
```

## 왜 "디자인 잘하는 AI"는 틀린 목표인가

[DesignPref](https://arxiv.org/abs/2511.20513)에서 전문 디자이너 스무 명이 UI 쌍
12,000개를 비교 평가했다. 서로 얼마나 일치했는가 — **Krippendorff's α = 0.248.**
비교의 4분의 1 이상에서 의견이 거의 완전히 갈렸다. "좋은 디자인"의 보편적 보상
함수는 존재하지 않는다. 그러니 평균 취향에 최적화한 모델이 위의 익명한 결과물을
내놓는 건 사고가 아니라 *목적함수의 논리적 귀결*이다.

대신 만들 수 있는 것:

1. **평균을 탐지한다.** 슬롭은 검사 가능하다. 결정론적 규칙 일곱 개.
2. **관점을 강제한다.** 컨셉 은유 하나가 모든 결정을 거른다.
3. **실물에서 배우되, 안전하게.** 스크린샷이 아니라 측정된 레퍼런스.
4. **본다.** 헤드리스로 렌더하고 숫자를 계산한다. 모델이 눈대중하게 두지 않는다.

## 설치

Claude Code 플러그인으로 (스킬이 `omd:ultradesign`, `omd:humanize` 형태로 표시된다):

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

요구사항: Node ≥ 22.18. 첫 `omd render` 실행 때 Playwright가 헤드리스 Chromium을
설치한다.

## 스킬

| 스킬 | 하는 일 |
|---|---|
| `omd:ultradesign` | 루프 전체를 끝까지. 승인 요청 없음 — 블로그를 시키면 블로그가 나오고, 모든 결정과 이유가 기록으로 남는다. |
| `omd:humanize` | 아무 글이나 AI티를 뺀다. 한국어·영어 AI 문체 틱(번역투, 기계적 나열, 상투어, 균일한 리듬, 헤징 더미)을 제거하되 사실은 한 글자도 바꾸지 않는다. |
| `omd:critique` | 고치지 않고 비평만. 린터를 돌리고, 발견을 근본 원인으로 묶고, 프로젝트 자신의 컨셉에 비추어 판정한다. |
| `omd:scout` | 측정된 레퍼런스 보드만 만든다 — 전체 페이지, 컴포넌트 하나, 타이포그래피 스터디, 모션 스터디, 커뮤니티 스레드. 디자인은 하지 않는다. |
| `omd:coach` | 검사 이력을 읽는다: 뭘 반복해서 틀리는지, 뭐가 나아지는지, 다음에 뭘 볼지. 데이터가 얇으면 추세를 지어내길 거부한다. |

## 슬롭 린터

`omd check`는 대비·히트 영역·간격·토큰 커버리지, 그리고 **슬롭** — 평균으로 수렴한
작업의 서명 — 을 계산한다. 전부 warn이다. 각 규칙은 의도된 선택에 대해 틀릴 수
있고, 기각하려면 이유를 글로 남겨야 한다.

| 규칙 | 잡는 것 |
|---|---|
| `SLOP-GRADIENT` | 인디고→바이올렛 그라디언트 (헥사 목록이 아니라 색상환 대역으로 판정) |
| `SLOP-RADIUS-MONOCULTURE` | 모든 모서리가 같은 반경 — 재질의 위계가 없다 |
| `SLOP-SHADOW-MONOCULTURE` | 같은 그림자의 반복 — 전부 떠 있으면 아무것도 안 떠 있다 |
| `SLOP-EVERYTHING-CENTERED` | 강조가 아니라 기본값이 된 가운데 정렬 |
| `SLOP-EMOJI-HEADING` | 타이포그래피가 못 한 일을 대신하는 이모지 |
| `SLOP-COPY` | "Unlock the power of…", "no fluff here", 한국어 AI 문체 틱 |
| `SLOP-TRIPLE-CARD` | 똑같은 기능 카드 세 장 — 무엇이 중요한지 아무도 정하지 않았다는 고백 |
| `SLOP-LEAKED-RATIONALE` | 설계 근거가 배송된 카피에 그대로 인용됨 |

마지막 규칙이 핑크 엘리펀트 실패다: *"잡다한 거 넣지 마"*라고 하면 모델은 페이지에
*"잡다한 내용은 없습니다"*라고 적는다. `omd check`는 페이지 텍스트와 프로젝트 설계
기록 사이에 연속 5어절이 겹치면 — 결정론적으로 — 잡아낸다.

실물로 보정했다: 규칙들은 *정확하고 접근성도 통과하지만 익명인* 픽스처에서 전부
발화하고, 같은 내용에 관점이 있는 픽스처에선 침묵하며, linear.app을 슬롭이라
부르지 않는다.

## 짝퉁 없는 레퍼런스

[Jansson & Smith (1991)](https://www.designsociety.org/download-publication/25504/Design+Fixation:+a+Cognitive+Model)의
발견: 예시를 보여주면 디자이너는 그 예시의 결함을 지적받은 뒤에도 그 특징을 그대로
재현한다. 모델은 더하다 — 본 것을 재현하는 게 학습 목표 그 자체였다. "Linear처럼
만들어줘"는 Linear 짝퉁을 낳는데, 짝퉁은 코트만 갈아입은 익명성이다.

그래서 모델은 레퍼런스의 픽셀을 보지 않는다. `omd ref add`가 페이지를 헤드리스로
렌더해서 **불변량** — 디자인을 실제로 지고 있는 측정값 — 을 뽑는다:

```jsonc
{
  "spacingLadder":   [4, 6, 8, 12, 16, 20, 24],
  "radiusLadder":    [4, 6, 8, 12, 16],        // 재질이 다섯. 하나가 아니라
  "typeScale":       [13, 14, 16, 21],          // 크기는 넷뿐, 위계는 굵기가 진다
  "fontFamilies":    ["inter"],
  "motionDurations": [100, 160],                // "빠릿하다"의 실측값
  "easingVocab":     ["ease", "ease-out"],
  "elevationLevels": 3                          // 헤어라인 보더는 높이로 안 센다
}
```

…그리고 모델이 렌더를 본 뒤에 쓴 원리 문장들: 원본을 한 번도 안 본 사람이 써먹을 수
있는 형태의 *왜*. 전체 페이지, 컴포넌트 하나(`--selector ".search"`), 타이포그래피
스터디, 모션 스터디, 렌더 불가능한 것(`--image`, 추론만)까지 캡처한다 — **커뮤니티
소스**도 포함해서: 바로 이 컴포넌트를 두고 디자이너들이 논쟁한 Reddit 스레드, 실패한
리디자인의 Hacker News 부검, Pinterest 보드의 무드. 페이지는 *무엇이 만들어졌는지*를
말해주고, 커뮤니티는 *사람들이 그걸 어떻게 느꼈는지*를 말해준다 — 어떤 측정도 만들지
못하는 증거다.

그리고 검사 가능한 부분:

```
$ omd ref distance ./my-page.html
  0.32  https://linear.app
  0.28  https://stripe.com
```

여러 레퍼런스에서 조립한 작업은 **그중 어느 하나와도 닮지 않아야 한다.** 단일
레퍼런스와 0.6 이상이면 빌드가 실패한다: 그건 디자인이 아니라 복제다.

## CLI

모델이 눈대중할 만한 것은 전부 명령으로 뺐다:

```
omd check  <page> [--json] [--category slop]   린트: a11y, 일관성, 슬롭. 발견 시 exit 1
omd render <page> -o shot.png                  헤드리스 스크린샷 (찍고 실제로 봐라)
omd ir     <page>                              렌더된 DOM → 측정된 노드 트리
omd ref    add|list|show|principles|distance   레퍼런스 보드
omd frame  set|show|reframe|generator          문제 기록 (아무도 서명하지 않는다. 루프가 다시 쓴다)
omd decision "what" --why "why"                후임자가 고마워할 이유 파일
omd coach                                      반복되는 약점, 정직한 추세
```

`omd check`는 발견이 있으면 exit 1 — 그대로 **CI 디자인 린터**로 쓸 수 있다.

## 저장소에 쌓이는 것

```
.omd/
  frame.md          문제가 무엇이라고 믿는지 — 리프레임 때 덧붙이지, 덮어쓰지 않는다
  decisions.md      이 제품에 왜 초록색이 없는지
  refs/*.json       측정된 레퍼런스 + 원리 문장
  history.jsonl     모든 검사 실행 — omd coach가 읽는 것
```

6개월 뒤 누군가 `decisions.md`를 읽고 이해한다.

## 정직한 한계

- 루프의 규율은 프롬프트가 강제하고, *측정*은 코드가 강제한다. 모델은 조언을 무시할
  수 있다 — 대비비를 조작할 수는 없다.
- 슬롭 규칙은 휴리스틱이다. 브랜드가 진짜 보라색일 수 있다. 그래서 warn이고, 기각에
  서면 이유가 필요하다.
- 레퍼런스 캡처는 공개 페이지를 실제 브라우저로 읽어 **측정값과 추론만 저장한다.
  에셋은 절대 저장하지 않는다.** 연구하는 사이트를 존중하라.
- Codex CLI 지원은 트리에 있지만(bare 설치) Claude Code 경로만큼 실전 검증되지 않았다.

## 이 도구가 딛고 선 연구

- Dorst & Cross, [*Creativity in the design process: co-evolution of problem–solution*](https://www.sciencedirect.com/science/article/pii/S0142694X01000096) — 전문가는 주어진 문제를 풀지 않는다. 부분해가 문제를 다시 가르치게 한다
- Schön, *The Reflective Practitioner* — see–move–see: 디자이너는 만든 것을 보면서 생각한다
- Darke의 primary generator — 완전한 이해보다 지배적 은유가 먼저 온다
- [DesignPref](https://arxiv.org/abs/2511.20513) — α = 0.248. 보편적 "좋음"은 없다
- [Jansson & Smith](https://www.designsociety.org/download-publication/25504/Design+Fixation:+a+Cognitive+Model) — 디자인 고착. 레퍼런스를 보여주지 않고 측정하는 이유
- [im-not-ai](https://github.com/epoko77-ai/im-not-ai) — `omd:humanize`의 근간인 한국어 AI 문체 분류

## 라이선스

MIT
