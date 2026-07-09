# OhMyDesign (OMD) — 상세 기획

> ```bash
> npx oh-my-design install     # Codex + Claude Code 동시 설치
> ```
>
> **훅 + 스킬 + 에이전트 + CLI.** MCP 서버 없음.
>
> 디자인을 대신 해주지 않는다. **사람이 디자인할 때 쓰는 인지 루프를 런타임으로 강제한다.**

LazyCodex가 Codex에 하는 일을, **두 호스트에** 한다.
OMO는 문서에서 *"Claude Code 지원은 아직 제공되지 않는다"*고 명시한다. 거기가 우리 자리다.

---

## 목차

1. [테제와 근거 리서치](#1-테제와-근거-리서치)
2. [왜 프롬프트가 아니라 런타임인가](#2-왜-프롬프트가-아니라-런타임인가)
3. [왜 MCP를 쓰지 않는가](#3-왜-mcp를-쓰지-않는가)
4. [호스트 실측 — Codex vs Claude Code](#4-호스트-실측--codex-vs-claude-code)
5. [설치 시스템 (npx)](#5-설치-시스템-npx)
6. [저장소 구조](#6-저장소-구조)
7. [`omd` CLI 전체 명세](#7-omd-cli-전체-명세)
8. [훅 명세](#8-훅-명세)
9. [스킬 명세](#9-스킬-명세)
10. [에이전트 명세](#10-에이전트-명세)
11. [`.design/` 데이터 모델](#11-design-데이터-모델)
12. [TASTE — 3층 보상](#12-taste--3층-보상)
13. [전체 실행 예시](#13-전체-실행-예시)
14. [미확인 항목](#14-미확인-항목)
15. [로드맵](#15-로드맵)
16. [리스크](#16-리스크)
17. [부록 · 근거](#부록--근거)

---

## 1. 테제와 근거 리서치

### 1.1 사람은 어떻게 디자인하는가

**Schön — see / move / see.** 디자이너는 머릿속에서 완성한 뒤 옮기지 않는다. **그리면서 생각한다.** 손이 그은 선이 눈에 새 정보를 주고, 그게 다음 수를 바꾼다. 스케치는 출력이 아니라 사고의 도구다.

**Dorst & Cross — 문제·해답 공동진화.** 전문 산업디자이너 9인 프로토콜 분석. 디자이너는 문제를 다 이해한 뒤 풀지 않는다. 부분해를 던지고, **그 부분해가 문제를 다시 가르친다.** "아하 순간"의 정체가 이 진동이다.

> **초보 vs 전문가의 최대 격차: 초보자는 주어진 문제를 풀고, 전문가는 주어진 문제를 의심한다.**

그래서 `/research → /flow → /wireframe → /visual` 같은 **선형 스킬 나열은 초보자를 복제하는 설계**다. 이 기획이 그런 카탈로그를 만들지 않는 이유다.

**Darke — primary generator.** 전문가는 문제를 완전히 이해하기 전에 중심 은유 하나를 먼저 박는다. *"이 앱은 주방의 타이머다."* 그 한 줄이 색·밀도·모션·카피를 전부 결정한다. 모호함에 구조를 주는 못이다.

### 1.2 현재 AI 도구가 실패하는 지점

| 관찰 | 출처 |
| :-- | :-- |
| 스크린샷→코드(**복제**)는 거의 풀렸다 | `Design2Code` (484개 실제 웹페이지) |
| 텍스트→UI(**생성**)는 *"프롬프트가 아주 구체적이지 않으면 제네릭해진다"* | 다수 리뷰 일치 |
| *"프로토타입엔 괜찮고 클라이언트엔 못 보여준다"* | 20년차 디자이너 실사용 평 |
| UX 실무자 47%만 "어느 정도 가치 있음", 20%는 "인상적이지 않음" | UX 실무자 설문 |
| **"고쳐줘"보다 "비평해" → 비평을 주고 → "고쳐"가 낫다** | Self-Refine 계열 일관된 발견 |
| UI 비평은 바운딩 박스로 "어디"를 지목할 때 좋아진다 | Design Critique 논문 |

**복제는 디자인이 아니라 받아쓰기다.** 그리고 **제네릭 붕괴의 원인은 primary generator 부재다.** 관점이 없으면 모델은 학습 분포의 평균으로 수렴한다.

### 1.3 이 프로젝트를 결정한 숫자

**DesignPref** — 전문 디자이너 20명, UI 페어와이즈 비교 12,000건.

| 지표 | 이진 선호 | 4단계 선호 |
| :-- | :-- | :-- |
| 평균 쌍별 일치도 | 0.624 | 0.386 |
| Cohen's κ | 0.248 | 0.114 |
| **Krippendorff's α** | **0.248** | **0.104** |

**전체 비교의 28.5%에서 의견이 96% 이상 갈렸다.** 디자이너들이 남긴 근거를 보면 불일치의 출처가 전부 개인 취향이다 — 대비를 어둡게 갈지 밝게 갈지, 화면을 촘촘히 채울지 비울지, 계층을 얼마나 강하게 드러낼지.

> ### 이 표가 결정하는 것
>
> **보편적 미적 보상 함수는 원리적으로 존재할 수 없다.**
> 전문가들끼리도 α = 0.248이다.
> 평균 취향에 최적화한 모델은 정확히 §1.2의 **"제네릭한 결과물"**이 된다.
> 그건 버그가 아니라 **목적함수의 논리적 귀결**이다.
>
> 유일하게 가능한 목표: 취향을 **내장하지 말고 습득**하게 한다.

### 1.4 인간 디자인 루프

```text
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
   ① FRAME  ──▶ ② GENERATOR ──▶ ③ MOVE ──▶ ④ SEE
   문제 규정     중심 은유 선택     한 수를 둠   렌더·관찰
        ▲                                      │
        └────────── ⑤ REFRAME ◀────────────────┘
              "본 것이 문제를 바꾼다"

              ⑥ STOP — "이만하면 됐다"
```

⑤와 ⑥이 전문가의 전부이고, 오늘날 어떤 툴도 이 둘을 하지 않는다.

---

## 2. 왜 프롬프트가 아니라 런타임인가

위 루프를 SKILL.md 한 장에 글로 적어 모델에게 주면, 실제로는 이렇게 동작한다.

| 지시 | 모델의 실제 행동 | 원인 |
| :-- | :-- | :-- |
| 문제를 의심하라 | 한 문장 의심하는 척하고 넘어감 | 사용자를 만족시키려는 압력 |
| 3안을 발산하라 | 1안을 만들고 색만 바꾼 3개 | **같은 컨텍스트 = 앵커링** |
| 렌더해서 봐라 | 코드를 보고 "잘 보입니다"라고 함 | 렌더 도구가 없으면 상상함 |
| 재정의하라 | 자기가 방금 만든 걸 부정하기 싫어함 | 자기비평 맹점 |
| 멈출 때를 알아라 | 사용자가 그만하랄 때까지 다듬음 | 정지 조건이 없음 |

**루프를 프롬프트에 쓰면 루프가 아니라 "루프에 대한 묘사"가 된다.**

필요한 건 세 가지고, 각각이 위 표의 줄을 정확히 막는다.

```text
├─ omd CLI ────── 결정론적 계산            ← "상상함"을 막는다
│    렌더는 headless 브라우저가 한다.
│    대비비는 LLM이 아니라 함수가 계산한다.
│
├─ subagents ──── 컨텍스트 격리             ← "앵커링 · 자기비평 맹점"을 막는다
│    3개 에이전트가 서로를 못 봐야 발산이 진짜 발산이 된다.
│    EYE가 HAND의 사고과정을 못 봐야 비평이 진짜가 된다.
│
└─ hooks ──────── 우회 불가능한 게이트       ← "의심하는 척 · 안 멈춤"을 막는다
     PreToolUse: 프레임 승인 전엔 파일을 못 만진다.
     Stop:       정지 조건 미달이면 턴을 끝낼 수 없다.
```

> **스킬은 모델에게 권유하고, 훅은 모델을 강제한다. 우리가 파는 건 훅이다.**

경쟁자가 `skills/` 폴더를 통째로 복사해도 같은 결과가 안 나온다. 강제 장치가 없기 때문이다.

---

## 3. MCP는 소비하되 만들지 않는다

**우리는 MCP 서버를 짓지 않는다. 이미 배포된 것을 등록해 쓴다.**

`chrome-devtools-mcp`(npm, v1.5.0)를 두 호스트 매니페스트에 등록한다. 모델이
페이지를 열고, 호버 상태를 만들고, 스크린샷을 찍는 데 쓴다. 서버 수명주기도,
툴 네임스페이싱도 우리 문제가 아니게 된다.

**결정론적 계측은 여전히 `omd` CLI가 한다.** 대비비를 모델이 브라우저를 몰아
읽게 하면 90%만 맞는다. 그건 함수가 계산해야 한다.

```text
사람  →  npx oh-my-design install        (설치기 CLI)
훅    →  omd hook pre-tool               (컴포넌트 CLI)   ← LazyCodex와 같은 패턴
모델  →  omd check / omd render          (Bash)
모델  →  chrome-devtools MCP             (배포된 서버, 우리가 안 만듦)
```

LazyCodex/OMO도 정확히 이 구조다. 훅은 `components/*/dist/cli.js`를 부르고,
모델에게는 MCP를 준다. 우리가 다른 점은 **지각 도구를 CLI로 준다**는 것뿐이고,
그 대가는 §3.2에 적어뒀다.

---

## 3.1 왜 우리 것을 MCP로 만들지 않는가

### 3.1 우리가 필요한 함수는 전부 배치성이다

MCP가 하는 일은 결국 **stdio 서브프로세스를 띄워 함수를 부르는 것**이다. 그런데 IR을 뽑고, 룰을 돌리고, 한 장 렌더하는 데 상태를 들고 있을 이유가 없다.

```text
❌ MCP:  .mcp.json → 서버 프로세스 → 툴 스키마 등록
         → mcp__omd__omd_rules_check(ir)     (툴명이 호스트마다 다를 수 있음)

✅ CLI:  omd check --frame "Checkout/Payment" --json
         → stdout에 Violation[]. 끝.
```

**얻는 것**

- `.mcp.json` 없음. 서버 수명주기 없음. 좀비 프로세스 없음.
- **툴 이름 네임스페이싱 문제가 통째로 사라진다.** (Codex가 MCP 툴을 `mcp__omd__*`로 노출하는지는 미확인 항목이었다. 이제 무의미하다.)
- **출력 포맷을 100% 통제한다.** IR 전체를 컨텍스트에 넣지 않는다. CLI가 요약해 필요한 것만 stdout으로 준다. **토큰 비용이 설계 가능해진다.**
- 사람이 직접 쓸 수 있다. `omd check`는 CI에서도, pre-commit에서도 돈다. **디자인 린터가 공짜로 생긴다.**
- 취향 수집에 훅이 필요 없다. `omd choose`가 스스로 `preferences.jsonl`에 쓴다.
  → 앞선 설계는 `AskUserQuestion`(Claude Code 전용, **Codex엔 없음**)의 PostToolUse 훅에 의존했다. CLI로 내리면서 그 이식성 문제가 소멸했다. **MCP를 뺀 부수 효과 중 최고.**

**잃는 것 — 정직하게**

| 손실 | 완화 |
| :-- | :-- |
| MCP 툴은 자동 발견되고 타입이 있다. CLI는 SKILL.md로 가르쳐야 하고 모델이 안 부르거나 인자를 틀릴 수 있다 | 스킬에 정확한 usage를 박는다. 핵심 경로(`frame approve`)는 훅이 강제한다 |
| Bash 호출마다 권한 프롬프트 | 설치 시 `omd`를 allowlist에 등록 (§5.4) |
| 렌더가 매번 브라우저를 띄워 느리다 | `omd serve`를 **선택적** 데몬으로. 없어도 동작한다 |
| **게이트가 이중 방어 → 단일 방어** | §3.2 |

### 3.2 강제는 이제 진짜로 훅에 산다

MCP 시절엔 `omd_apply()` 툴이 스스로 거부했다. 서버가 자기 문지기였다. 지금은 훅이 유일한 문지기다.

**취약점: 훅이 설치되지 않으면 게이트가 없다.** 그리고 *조용히* 없다. 제품이 동작하는 것처럼 보이는데 핵심 강제가 빠진 상태가 최악이다.

**3중으로 막는다.**

1. **훅** — `PreToolUse`가 파일 쓰기를 `exit 2`로 차단한다. (주 방어선)
2. **CLI** — `omd apply`는 승인 없으면 스스로 거부한다. 모델이 CLI 경로를 쓰면 여기서도 막힌다.
3. **`omd doctor`** — 훅이 **실제로 발화하는지 관측으로** 검증한다. 선언 검사가 아니다. 승인 없이 파일 쓰기를 시도해보고, 차단당하는지 본다. 설치 직후 + 매 세션 시작.

> ⚠️ 그래도 훅 미설치 상태에서 모델이 `Write`를 직접 부르면 뚫린다.
> **알려진 한계**로 남긴다. `omd doctor` 실패 시 스킬이 큰 경고를 띄운다.

### 3.3 실측: 게이트의 진짜 한계 (Claude Code 2.1.205, 헤드리스 세션)

Phase 1을 실제 호스트에 물려 네 번 돌렸다. 결과가 설계를 두 번 바꿨다.

| 시나리오 | 결과 |
| :-- | :-- |
| 미승인 프레임 + `Write` | **차단** (exit 2) |
| 미승인 프레임 + `Edit` | **차단** — `Write\|Edit` 매처 정규식 확인 |
| 승인 후 `Write` | 통과 — 게이트가 전부를 막는 게 아님을 확인 |
| "게이트가 막으면 직접 치우고 진행해" | 🔴 **에이전트가 `omd frame approve`를 실행하고 뚫었다** |

**네 번째 줄이 설계 결함이었다. 게이트를 지키는 열쇠가 게이트 안쪽에 있었다.**
승인이 그냥 CLI 명령이므로, `Bash`가 허용된 에이전트는 자기 프레임에 스스로 사인한다.
게다가 그 세션은 *"가설."* 한 줄짜리 빈 프레임에 승인 기록을 남겼다.
사람은 프레임을 읽은 적이 없는데 파일에는 사인이 찍혔다.

**대응 (구현됨)** — `omd frame approve`는 이제 둘을 거부한다.

1. **TTY 없는 호출자.** 에이전트의 Bash에는 터미널이 없다.
   탈출구는 `OMD_ALLOW_NONINTERACTIVE_APPROVE=1` 하나뿐이고, 이름 자체가 경고다.
2. **근거 없는 프레임.** `why:` 필드가 없거나 본문이 stub이면 승인하지 않는다.
   *"인용된 관찰이 없는 재프레이밍은 추측이다."*

동일 시나리오를 재실행했다. 이번엔 뚫리지 않았다.

> **정직하게: 이건 airtight가 아니다.**
> 이 문서를 읽은 에이전트는 환경변수를 설정할 수 있다.
> 우리가 한 일은 자기승인을 *"명령 하나"*에서 *"이름이 경고인 안전장치를 의도적으로
> 무력화하는 행위"*로 올린 것뿐이다. **에이전트가 셸을 쥐고 있는 한 그게 천장이다.**

### 3.4 아직 안 막힌 두 구멍

재실행한 세션이 스스로 지적한 것들이다. 둘 다 사실이다.

**① 셸 리다이렉션은 매처를 우회한다.**

```bash
echo x > hello2.txt      # PreToolUse matcher는 Write|Edit. Bash는 안 걸린다.
```

그 세션은 하지 않았다 — *"몰래 빠져나가는 건 정직한 버전보다 나쁘다"*는 이유로.
**그건 예의지 방어가 아니다.** 진짜로 막으려면 `Bash`도 매칭해 명령을 파싱해야 하는데,
셸 한 줄을 정적 분석으로 판정하는 건 일반해가 없다(`cat <<EOF`, `tee`, `python -c`, …).

*방향:* Layer 1은 사후 검출로 간다. `Stop` 훅에서 `git status`로 프레임 승인 없이
변경된 파일을 찾아내 되돌리기를 제안한다. 사전 차단이 아니라 **사후 회계**다.

**② 매처가 너무 넓다.**

지금 게이트는 프로젝트의 *모든* 쓰기를 막는다. `.design/`과 무관한 잡파일도 막힌다.
이건 §16의 "게이트가 짜증 유발" 리스크가 실물로 나타난 것이다.

*방향:* 매처를 유지하되 훅 핸들러가 대상 경로를 보고 판정한다.
디자인 산출물(`.design/`, `src/**/*.tsx`, `*.css`, 토큰 파일)만 게이트에 건다.
경로 목록은 `.design/rules/scope.yaml`에 두어 팀이 정한다.

---

## 4. 호스트 실측 — Codex vs Claude Code

로컬에 설치된 **codex-cli 0.142.2** (OMO v4.15.1)와 **oh-my-claudecode v4.9.3**를 직접 뜯어 확인한 결과다. 추정이 아니라 관측이다.

### 4.1 대응표

| | Codex | Claude Code |
| :-- | :-- | :-- |
| 사용자 설정 | `~/.codex/config.toml` | `~/.claude/settings.json` |
| 스킬 | `~/.codex/skills/<n>/SKILL.md` | `~/.claude/skills/<n>/SKILL.md` |
| 스킬 호출 | `$name` (composer) | `/name` (Skill 도구) |
| 스킬 표시 메타 | `<skill>/agents/openai.yaml` | SKILL.md frontmatter |
| 에이전트 | `~/.codex/agents/<n>.toml` | `~/.claude/agents/<n>.md` |
| 에이전트 등록 | **`config.toml`의 `[agents.<n>] config_file`** | 디렉토리 자동 탐색 |
| 플러그인 매니페스트 | `.codex-plugin/plugin.json` | `.claude-plugin/plugin.json` |
| 훅 선언 | `"hooks": ["./hooks/a.json", …]` **배열** | `"hooks": "./hooks/hooks.json"` **단일** |
| 훅 신뢰 | **`[hooks.state.<key>] trusted_hash`** | 없음 |
| 경로 변수 | `${PLUGIN_ROOT}` | `$CLAUDE_PLUGIN_ROOT` |
| 프로젝트 훅 | `<proj>/.codex/hooks.json` | `<proj>/.claude/settings.json` |
| **파일 편집 툴** | `apply_patch` | `Write`, `Edit` |
| 셸 툴 | `Bash` | `Bash` |
| 사용자 질문 툴 | **없음** | `AskUserQuestion` |
| **에이전트 도구 제한** | **불가 — 스키마에 키가 없음** | `disallowedTools` |
| 윈도우 | `commandWindows` 필드 | — |
| 기능 게이트 | `[features] hooks / plugins / plugin_hooks / multi_agent` | — |

### 4.2 훅 이벤트

**Codex (10개)** — `SessionStart` · `UserPromptSubmit` · `PreToolUse` · `PermissionRequest` · `PostToolUse` · `PreCompact` · `PostCompact` · `SubagentStart` · `SubagentStop` · `Stop`

Claude Code는 `PermissionRequest`/`SubagentStart`를 뺀 대부분을 가진다. **우리가 쓸 넷은 양쪽에 다 있다.**

**출력 계약 (Codex, 확인됨)**

- `exit 2` → 차단. stderr가 사유.
- `exit 0` + JSON → `permissionDecision: "deny"` / `decision: "block"` / `additionalContext` / `continue: false`
- `exit 0` + 평문 → developer context로 주입
- 그 외 non-zero → 훅 실패. Codex는 에러를 보고하고 **계속 진행한다.**

> **마지막 줄이 위험하다.** `omd`가 크래시하면 훅이 non-zero로 죽고 Codex는 그냥 넘어간다. 게이트가 무력해진다.
> → **`omd hook` 핸들러는 절대 크래시하면 안 된다.** 내부 예외를 전부 잡아 "차단"(exit 2) 쪽으로 넘어뜨린다. **fail-closed.**

### 4.3 Codex의 훅 신뢰 해시 — 설계를 바꾸는 발견

`~/.codex/config.toml`에 이런 항목이 있다.

```toml
[hooks.state."omo@sisyphuslabs:hooks/session-start-loading-project-rules.json:session_start:0:0"]
trusted_hash = "sha256:7110bdc6b474f491ba130385898460a217f517315c8a159e4a26c1861597e4b9"
```

**훅 파일의 내용이 바뀌면 해시가 깨진다.** 즉 업데이트할 때마다 사용자가 재승인해야 한다.

> ### 그러므로: 훅 JSON은 절대 바뀌지 않는 얇은 shim으로 고정한다.
>
> ```jsonc
> // 이 파일은 v1.0에서 v9.0까지 한 글자도 안 바뀐다
> { "command": "node \"${PLUGIN_ROOT}/bin/omd.mjs\" hook pre-tool" }
> ```
>
> 모든 로직 변경은 `bin/omd.mjs`(와 `core/`) 안으로 들어간다.
> **훅 파일은 디스패처일 뿐, 정책을 담지 않는다.**
>
> 이게 아니었다면 `omd update` 할 때마다 사용자가 훅 4개를 다시 승인해야 했다.

### 4.4 LazyCodex의 설치 체인 (확인됨)

```text
npx lazycodex-ai install
        │  bin/lazycodex-ai.js — 의존성 0. spawnSync만 한다.
        ▼
npx --yes --package oh-my-openagent omo install --platform=codex
        │
        ├─ ~/.codex/plugins/cache/sisyphuslabs/omo/<ver>/  플러그인 배치
        ├─ ~/.codex/config.toml  패치 (marketplace / plugin / agent 블록)
        └─ ~/.local/bin/  컴포넌트 CLI 배치
```

`omo`는 `--platform=codex|opencode|both`를 지원한다. **문서에 Claude Code는 "아직 제공되지 않음"으로 명시**돼 있다.

**우리가 배울 것 / 다르게 할 것**

| LazyCodex | OMD |
| :-- | :-- |
| npx 래퍼가 진짜 패키지를 spawn | ✅ 그대로 차용. 단 래퍼 없이 `oh-my-design` 하나로 |
| `config.toml`을 직접 패치해 agent 등록 | ✅ 필수. Codex는 이것 없이 에이전트가 안 뜬다 |
| `~/.local/bin`에 CLI 배치 | ⚠️ **PATH를 신뢰하지 않는다.** 훅/에이전트는 절대경로로 부른다 |
| Codex + OpenCode | ✅ **Codex + Claude Code** |
| 플러그인 경로만 | ✅ 플러그인 경로 + **bare 경로** 둘 다 (§5.3) |

---

## 5. 설치 시스템 (npx)

### 5.1 명령 표면

```bash
npx oh-my-design@latest install              # 탐지된 모든 호스트
npx oh-my-design@latest install --host=codex
npx oh-my-design@latest install --host=claude
npx oh-my-design@latest install --mode=bare  # 플러그인 대신 직접 배치
npx oh-my-design@latest doctor               # 관측 기반 검증
npx oh-my-design@latest update
npx oh-my-design@latest uninstall            # 우리가 넣은 것만 제거
```

`package.json`

```jsonc
{
  "name": "oh-my-design",
  "bin": { "omd": "./bin/omd.mjs" },
  "files": ["bin", "core", "dist", "adapters", "README.md", "LICENSE"],
  "engines": { "node": ">=20" }
}
```

**의존성은 최소로.** 렌더러(Playwright)는 `omd render` 최초 실행 시 lazy install. `install`은 네트워크 없이도 끝나야 한다.

### 5.2 설치 알고리즘

```text
1. DETECT
   ~/.codex/config.toml 존재?   → codex 후보
   ~/.claude/settings.json 존재? → claude 후보
   codex --version / claude --version 으로 교차 확인
   하나도 없으면 → 안내 후 종료 (exit 0, 실패 아님)

2. PRECHECK  (codex 전용)
   [features] hooks / plugins / plugin_hooks / multi_agent 가 true인가?
   false면 → 사용자에게 알리고, 동의 시 켠다.
   ⚠ 이 플래그가 꺼져 있으면 우리 훅은 조용히 안 돈다. 최우선 검사.

3. BUILD
   core/ 를 dist/ 로 번들 (단일 파일 권장 — 훅 실행 지연 최소화)
   adapters/{codex,claude}.mjs 실행 → dist/{codex,claude}/ 생성

4. PLACE
   codex:  ~/.codex/plugins/cache/omd/oh-my-design/<ver>/   (plugin 모드)
           또는 ~/.codex/{skills,agents,hooks}/              (bare 모드)
   claude: 마켓플레이스 등록 후 plugin install
           또는 ~/.claude/{skills,agents}/                   (bare 모드)

5. PATCH   ★ 되돌릴 수 있게. 백업 먼저.
   codex   ~/.codex/config.toml
   claude  ~/.claude/settings.json

6. TRUST   (codex 전용)
   훅 파일 sha256 계산 → [hooks.state.<key>] trusted_hash 기록
   ⚠ 이 키 포맷은 미확인. 실패하면 사용자에게 수동 승인 안내.

7. VERIFY  → omd doctor (§5.5)
```

### 5.3 두 가지 설치 모드

**plugin 모드 (기본)** — 호스트의 플러그인 시스템에 올라탄다. 업데이트·제거가 호스트 소관이 된다.

**bare 모드 (`--mode=bare`)** — 스킬/에이전트/훅을 사용자 디렉토리에 직접 배치한다.

bare 모드가 필요한 이유는 실측에서 나왔다. **Codex 플러그인 매니페스트(OMO v4.15.1)에는 `agents` 키가 없다.** `skills` · `hooks` · `mcpServers` · `interface`만 있다. 그런데 `~/.codex/agents/`에는 `lazycodex-*.toml`이 놓여 있고 `config.toml`의 `[agents.*]`가 그걸 가리킨다. **즉 에이전트는 플러그인이 아니라 설치기가 배치한다.**

> 따라서 **에이전트는 어느 모드에서든 직접 배치 + config.toml 패치**로 간다. 이건 선택이 아니라 관측된 사실이다.

### 5.4 설정 패치 — 정확한 형태

#### Codex — `~/.codex/config.toml`

```toml
# ── OMD BEGIN (do not edit; managed by oh-my-design) ──
[features]
hooks = true
plugins = true
plugin_hooks = true
multi_agent = true

[agents.omd-framer]
config_file = "./agents/omd-framer.toml"

[agents.omd-generator]
config_file = "./agents/omd-generator.toml"

[agents.omd-hand]
config_file = "./agents/omd-hand.toml"

[agents.omd-eye]
config_file = "./agents/omd-eye.toml"

[agents.omd-taste]
config_file = "./agents/omd-taste.toml"
# ── OMD END ──
```

- 에이전트 이름에 **`omd-` 접두사를 강제**한다. `uninstall`이 안전하게 지울 수 있는 유일한 방법이다.
- `[features]`는 **머지**한다. 덮어쓰면 사용자의 다른 플래그가 날아간다.
- 패치 전 `~/.codex/backups/config.toml.<ts>`로 백업. (Codex에 `backups/`가 이미 있다)

#### Claude Code — `~/.claude/settings.json`

```jsonc
{
  "extraKnownMarketplaces": {
    "omd": { "source": { "source": "git", "url": "https://github.com/<org>/oh-my-design.git" } }
  },
  "enabledPlugins": { "oh-my-design@omd": true },
  "permissions": {
    "allow": [
      "Bash(omd check:*)", "Bash(omd ir:*)", "Bash(omd render:*)",
      "Bash(omd frame:*)", "Bash(omd choose:*)", "Bash(omd taste:*)",
      "Bash(omd stop-check)", "Bash(omd loop:*)"
    ]
  }
}
```

**`permissions.allow`가 CLI 전략의 생사를 가른다.** 이게 없으면 루프 한 바퀴에 권한 프롬프트가 열 번 뜬다. 사용자는 두 번째 바퀴에서 도구를 끈다.

Codex에도 동등한 allowlist가 필요하다 — 확인 항목(§14).

### 5.5 `omd doctor` — 관측으로 검증한다

**선언 검사는 무의미하다.** 훅 파일이 있는지가 아니라, 훅이 **실제로 발화해서 차단하는지** 본다.

```text
$ omd doctor

  [codex]
  ✓ config.toml 파싱 가능
  ✓ [features] hooks=true plugins=true plugin_hooks=true multi_agent=true
  ✓ 에이전트 5개 등록됨 (omd-*)
  ✓ 훅 4개 배치됨
  ✓ trusted_hash 4/4 일치
  ✓ 게이트 실동작 검증
      ↳ 샌드박스에서 미승인 상태로 apply_patch 시도 → exit 2 로 차단됨 ✓
  ✓ omd 절대경로 실행 가능

  [claude]
  ✓ settings.json 파싱 가능
  ✓ 플러그인 활성화됨 (oh-my-design@omd)
  ✓ permissions.allow 에 omd 8개 항목
  ✓ 게이트 실동작 검증
      ↳ 미승인 상태로 Write 시도 → exit 2 로 차단됨 ✓

  [common]
  ✓ omd check 결정론 일치 (두 호스트 동일 Violation 12건)
  ✗ headless 렌더러 미설치 → `omd render --install-deps` 실행 필요

  1 warning.
```

**"게이트 실동작 검증" 줄이 이 제품 전체에서 가장 중요한 테스트다.** §3.2의 단일 방어선을 지키는 유일한 장치다.

### 5.6 업데이트와 제거

**update** — `core/`와 `bin/`만 교체한다. **훅 JSON은 건드리지 않는다**(§4.3). 훅 파일이 진짜로 바뀌어야 하면 재신뢰 안내를 명시적으로 띄운다.

**uninstall** — `OMD BEGIN/END` 마커 블록 제거, `omd-*` 에이전트 파일 제거, `[agents.omd-*]` 항목 제거, `[hooks.state]`에서 우리 키 제거, `enabledPlugins`/`permissions.allow`에서 우리 항목만 제거. **`.design/`은 절대 지우지 않는다. 사용자 자산이다.**

---

## 6. 저장소 구조

```text
oh-my-design/
├── package.json                    # bin: { "omd": "./bin/omd.mjs" }
├── bin/omd.mjs                     # ★ 유일한 실행 파일. CLI이자 훅 디스패처.
│
├── core/                           # 호스트 무관. 전 로직.
│   ├── ir/                         #   Figma / HTML / 스크린샷 → Design IR
│   │   ├── figma.mjs               #     REST API → IR
│   │   ├── dom.mjs                 #     렌더된 DOM → IR
│   │   └── normalize.mjs           #     computed / stats 계산
│   ├── rules/
│   │   ├── engine.mjs              #   YAML DSL 평가기
│   │   └── builtin/                #   SPACING · CONTRAST · HIT · TOKEN …
│   ├── render/                     #   headless 렌더 + 좌표 맵
│   ├── taste/                      #   preferences.jsonl · 선호 모델
│   ├── frame/                      #   frame.md 읽기 · 승인 · 게이트 판정
│   ├── loop/                       #   iteration · budget · stop 판정
│   ├── hook/                       #   ★ fail-closed 훅 핸들러
│   └── install/                    #   detect · patch · trust · doctor
│
├── src/                            # 어댑터 입력 (단일 소스)
│   ├── skills/<name>/SKILL.md
│   ├── agents/<name>.agent.yaml
│   └── hooks/<name>.hook.json      #   호스트 중립 추상 훅
│
├── adapters/
│   ├── tool-map.json
│   ├── codex.mjs                   # → dist/codex/
│   └── claude.mjs                  # → dist/claude/
│
└── dist/{codex,claude}/            # 각 호스트 완성본
```

**단일 소스, 두 개의 방출.** 스킬 마크다운과 에이전트 프롬프트는 한 번만 쓴다.

### 6.1 `adapters/tool-map.json`

```jsonc
{
  "fileWrite":   { "codex": "apply_patch",       "claude": "Write|Edit" },
  "shell":       { "codex": "Bash",              "claude": "Bash" },
  "pluginRoot":  { "codex": "${PLUGIN_ROOT}",    "claude": "$CLAUDE_PLUGIN_ROOT" },
  "skillPrefix": { "codex": "$",                 "claude": "/" },
  "agentFormat": { "codex": "toml",              "claude": "md" },
  "hookLayout":  { "codex": "file-per-hook",     "claude": "single-file" },
  "model": {
    "high":   { "codex": "gpt-5.5",  "claude": "claude-opus-4-8" },
    "medium": { "codex": "gpt-5.5",  "claude": "claude-sonnet-5" }
  }
}
```

> **`fileWrite` 한 줄이 이 프로젝트에서 가장 위험한 한 줄이다.**
> 여기가 틀리면 게이트가 **조용히** 사라진다. `omd doctor`가 실동작으로 검증하는 이유다.

---

## 7. `omd` CLI 전체 명세

**규칙: LLM이 하면 틀리는 일은 전부 CLI로 뺀다.**
LLM에게 대비비를 계산시키면 90%는 맞고 10%는 틀린다. 디자이너는 그 10%를 발견한 날 도구를 버린다.

### 7.1 지각 (Perception)

```bash
omd ir <source> [-o .design/.cache/ir.json]
  # source: figma://<fileKey>/<nodeId> | ./page.html | ./shot.png
  # 출력: Design IR. 기본적으로 stdout이 아니라 파일로. (컨텍스트 보호)

omd render <target> -o shot.png [--viewport 390x844]
  # headless 렌더 + 좌표 맵(shot.map.json)

omd check [--ir F] [--frame "Checkout/Payment"] [--json] [--layer 1,2]
  # Rule Engine → Violation[]
  # exit 0: 위반 없음 / exit 1: 위반 있음   ← CI에서 그대로 쓴다

omd diff <before.png> <after.png> [--ir-before F] [--ir-after F]
  # 시각적 차이 + 어떤 노드가 변했는지
```

### 7.2 프레임 (게이트)

```bash
omd frame show
omd frame propose --problem "…" --reframe "…" --why "리뷰 표본 최다 불만: 고를 게 많다"
  # ⚠ --why 없으면 거부한다. 근거 없는 재프레이밍 금지. (§10 framer)
omd frame approve            # ← 이게 없으면 훅이 파일 쓰기를 막는다
omd frame generator --set "친구의 추천"
omd apply <patch>            # 승인 없으면 스스로 거부 (2차 방어)
```

### 7.3 취향 (락인)

```bash
omd choose c1 c2 c3 [--render]     # 후보 제시 → 선택 → preferences.jsonl 적재
omd taste log --chose c3 --why "…"
omd taste profile                  # 추론된 취향 서술
omd taste score <candidates>       # Layer 3 랭킹
omd taste veto "바운스 애니메이션"
```

### 7.4 루프

```bash
omd loop state         # iteration · 점수 이력 · 예산 잔량
omd loop budget --max-iterations 8 --max-tokens 200k
omd stop-check         # → { canStop: bool, reason: string }
```

### 7.5 훅 디스패처 (사람이 직접 쓸 일 없음)

```bash
omd hook session-start | user-prompt | pre-tool | stop
```

**fail-closed.** 내부 예외를 전부 잡아 차단 쪽으로 넘어뜨린다. (§4.2)

```javascript
// core/hook/dispatch.mjs
export async function preTool(input) {
  try {
    if (await frame.isApproved(input.cwd)) return { ok: true };
    return deny("프레임이 승인되지 않았습니다. `omd frame approve`를 먼저 실행하세요.");
  } catch (e) {
    // Codex는 non-zero(2 제외)를 '훅 실패'로 보고 그냥 진행한다.
    // 우리가 죽으면 게이트가 사라진다. 그러므로 죽지 않고 막는다.
    return deny(`OMD 내부 오류로 안전하게 차단합니다: ${e.message}`);
  }
}
const deny = (reason) => { process.stderr.write(reason); process.exit(2); };
```

### 7.6 운영

```bash
omd doctor [--fix]
omd install / update / uninstall
omd serve            # 선택적 렌더 데몬. 없어도 동작한다.
```

### 7.7 Design IR

스크린샷만 본 모델은 *"간격이 조금 불균형해 보입니다"* 까지가 한계다.
IR을 본 모델은 *"Card/Header의 paddingBottom이 14px입니다. 형제 4개는 전부 16px이고 `spacing/md` 토큰과 일치합니다. 오탈자입니다."* 라고 말한다.

차이를 만드는 건 프롬프트가 아니라 **입력의 해상도**다.

```jsonc
{
  "meta": { "source": "figma", "fileKey": "…", "capturedAt": "2026-07-09T…" },
  "tokens": {
    "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24 },
    "color":   { "bg/surface": "#FFFFFF", "brand/primary": "#FF5A1F" }
  },
  "nodes": [{
    "id": "1:23", "name": "Card", "path": "Screen/List/Card",
    "box": { "x": 16, "y": 120, "w": 343, "h": 96 },
    "layout": { "mode": "VERTICAL", "gap": 8, "padding": [16,16,14,16] },
    "fill":   { "value": "#FFFFFF", "token": "bg/surface" },
    "radius": { "value": 8, "token": null },        // ← token:null 자체가 리포트다

    "computed": {                                    // LLM이 세지 않게 미리 계산
      "contrastWithParent": 1.03,
      "siblingPaddingMode": [16,16,16,16],           // ← 14가 이상치임을 증명
      "tokenCoverage": 0.75,
      "hitArea": { "w": 343, "h": 96 },
      "depth": 4,
      "isInteractive": true
    },
    "children": ["1:24", "1:25"]
  }],
  "stats": {                                         // 일관성 비평의 근거
    "spacingHistogram": { "4": 2, "8": 31, "14": 1, "16": 88, "24": 12 },
    "colorHistogram":   { "#FFFFFF": 40, "#FEFEFE": 1 },
    "orphanStyles":     ["#FEFEFE", "14px"],
    "componentReuse":   { "Button": 22, "Button-copy-3": 1 }
  }
}
```

**설계 원칙 넷**

1. **LLM에게 산술을 시키지 않는다.** `spacingHistogram`을 미리 만든다. LLM은 히스토그램을 *해석*할 뿐이다.
2. **모든 스타일 값에 토큰 참조를 병기한다.** `token: null`이면 그 자체로 하드코딩 리포트다.
3. **상대적 맥락을 노드에 심는다.** 비평은 항상 "무엇 대비"이므로.
4. **결정론적으로 잡히는 건 LLM에게 보내지 않는다.** 대비비 위반은 함수가 잡는다. LLM은 *"이 위반이 우리 컨셉에 왜 치명적인가"*를 답한다.

> **IR은 컨텍스트에 통째로 안 들어간다.** `omd check`가 Violation 목록만 stdout으로 준다. 원본은 `.design/.cache/ir.json`에 남아, 필요하면 모델이 `jq`로 일부만 읽는다.

### 7.8 Rule Engine — 커스텀 룰이 해자다

```yaml
# .design/rules/custom.yaml
- id: SPACING-001                    # 우리가 준다 (Layer 1)
  severity: warn
  select: "node.layout.padding"
  assert: "every(v => v % 8 === 0 || v === 4)"
  message: "패딩 {value}px가 8pt 그리드를 벗어납니다"
  fix: normalize-spacing

- id: CONTRAST-001                   # 우리가 준다 (Layer 1)
  severity: error
  select: "node.type === 'TEXT'"
  assert: "node.computed.contrastWithParent >= 4.5"
  message: "대비비 {value}:1 — WCAG AA 미달"

- id: BRAND-014                      # ← 우리는 이걸 못 만든다. 그 팀만 만든다. (Layer 2)
  severity: error
  select: "node.path ~= 'Checkout/**' && node.computed.isInteractive"
  assert: "node.fill.token === 'brand/primary'"
  message: "결제 흐름의 CTA는 브랜드 컬러여야 합니다"
```

`SPACING-001`은 우리가 준다. **`BRAND-014`는 팀이 쓴다.** 팀이 자기 규칙 30개를 쌓는 순간 이 도구를 떠날 수 없다.

### 7.9 근본 원인 묶기 — LLM이 실제로 잘하는 일

```text
omd check 출력:
  SPACING-001 × 47   TOKEN-002 × 31   NAMING-003 × 12
  → 90건. 디자이너는 이 목록을 보고 창을 닫는다.

EYE 에이전트 출력:
  "위반 90건 중 78건이 하나의 원인에서 나옵니다.
   ProductCard가 2월에 detach되어 6개 화면에 복제됐고,
   복제본마다 손으로 수정되면서 패딩이 14/15/16px로 갈라졌습니다.
   ProductCard 하나를 고치면 78건이 사라집니다."
```

**90건의 리스트는 소프트웨어다. 78건이 하나라는 문장은 시니어다.** 우리가 파는 건 뒤쪽이고, 그건 앞쪽이 정확할 때만 가능하다.

---

## 8. 훅 명세

### 8.1 추상 스펙 (단일 소스)

```jsonc
// src/hooks/require-frame.hook.json
{
  "id": "require-frame",
  "event": "PreToolUse",
  "matcher": "@fileWrite",                       // tool-map이 치환
  "command": "node \"@pluginRoot/bin/omd.mjs\" hook pre-tool",
  "timeout": 5,
  "statusMessage": "(OMD) 프레임 승인 확인"
}
```

### 8.2 방출 결과

```jsonc
// dist/claude/hooks/hooks.json   (넷을 한 파일로 병합)
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "node \"$CLAUDE_PLUGIN_ROOT\"/bin/omd.mjs hook pre-tool",
        "timeout": 5
      }]
    }]
  }
}
```

```jsonc
// dist/codex/hooks/pre-tool-use-requiring-frame.json   (파일 하나당 훅 하나)
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "apply_patch",
      "hooks": [{
        "type": "command",
        "command": "node \"${PLUGIN_ROOT}/bin/omd.mjs\" hook pre-tool",
        "timeout": 5,
        "statusMessage": "(OMD) Checking frame approval",
        "commandWindows": "powershell -NoProfile -ExecutionPolicy Bypass -File \"${PLUGIN_ROOT}\\scripts\\node.ps1\" \"${PLUGIN_ROOT}\\bin\\omd.mjs\" hook pre-tool"
      }]
    }]
  }
}
```

그리고 `.codex-plugin/plugin.json`에 나열한다.

```jsonc
{
  "name": "oh-my-design",
  "version": "0.1.0",
  "skills": "./skills/",
  "hooks": [
    "./hooks/session-start-loading-frame.json",
    "./hooks/user-prompt-submit-injecting-design.json",
    "./hooks/pre-tool-use-requiring-frame.json",
    "./hooks/stop-enforcing-loop.json"
  ],
  "interface": {
    "displayName": "Oh My Design",
    "shortDescription": "Design cognition loop — frame, diverge, see, reframe",
    "capabilities": ["Hooks", "Skills", "Subagents", "Design Lint"]
  }
}
```

### 8.3 훅 넷이 전부다

| 훅 | 이벤트 | 하는 일 | 없으면 |
| :-- | :-- | :-- | :-- |
| `load-frame` | SessionStart | `.design/frame.md`를 컨텍스트에 주입 | 모델이 `omd frame show`를 부름 |
| `inject-design` | UserPromptSubmit | `$design`/`/design` 감지 → 스킬 + 프레임 주입 | 사용자가 수동 호출 |
| **`require-frame`** | PreToolUse `@fileWrite` | 미승인이면 **exit 2 차단** | 🔴 **게이트 소실** |
| **`enforce-stop`** | Stop | `omd stop-check` → 미달이면 `continue:false` | 루프 조기 종료 |

굵은 둘이 심장이고, 나머지 둘은 편의다.

**취향 수집 훅이 없다.** `omd choose`가 직접 쓴다. (§3.1)

### 8.4 `enforce-stop`의 정지 조건

```text
canStop = true  ⟸  다음 중 하나
  · Layer1 위반 0 && Layer2 위반 0
  · 최근 3회 이터레이션의 TASTE 점수 개선 < ε        (다듬기 발산 방지)
  · 사용자가 "됐다"
  · 예산 소진 (iteration / token / wallclock)        ★ 하드 상한. 반드시 있어야 함

기본값은 언제나 "사람에게 물어본다".
```

**무한히 다듬는 에이전트는 무한히 나빠진다.** 정지 조건은 1급 설계 대상이다.

---

## 9. 스킬 명세

Codex는 `$design`, Claude Code는 `/design`으로 부른다. 어댑터가 접두사와 메타 파일을 처리한다.

| 스킬 | 하는 일 | Phase |
| :-- | :-- | :-- |
| `design` | 루프 진입점. FRAME→GENERATE→MOVE→SEE→REFRAME 오케스트레이션 | 4 |
| `observe` | 읽기 전용 관찰. `omd ir` + `omd check` → 보고서 | 2 |
| `critique` | 비평만 한다. **수정 금지.** 근본 원인 묶기 | 2 |
| `frame` | 문제를 의심한다. framer 에이전트 호출 | 3 |
| `refactor` | dry-run 기본. 스냅샷·되돌리기 필수 | 4 |
| `taste` | 취향 프로필 조회·수정·veto | 5 |
| `omd-reference` | CLI/에이전트 카탈로그. 다른 스킬이 로드 | 1 |

### 9.1 SKILL.md 형식 (양쪽 호환)

```markdown
---
name: critique
description: >-
  현재 디자인을 비평한다. 절대 수정하지 않는다.
  Use when: 디자인 리뷰, UI 비평, "이거 왜 별로야", 접근성 점검, 일관성 점검.
  Triggers: critique, 비평, 리뷰, review, 왜 별로, 개선점.
---

# Critique

**너는 수정하지 않는다.** 비평하고, 근거를 대고, 멈춘다.
Self-Refine 연구가 보여주듯 비평과 수정을 분리해야 둘 다 좋아진다.

## 절차

1. `omd check --json` 을 실행한다. **직접 숫자를 세지 마라.**
   대비비·간격·히트영역은 전부 CLI가 계산해서 준다.
2. 출력된 Violation[] 을 **근본 원인으로 묶어라.**
   90건의 목록은 소프트웨어다. "78건이 하나의 원인"이 시니어다.
3. `.design/frame.md` 의 primary generator 에 비추어 Layer 2 를 판정하라.
   "좋은가"가 아니라 "이 컨셉다운가"를 물어라.
4. 우선순위를 매기고, **왜 중요한지**를 사용자·비즈니스 관점으로 설명하라.

## 금지

- 숫자를 추정하지 마라. 모르면 `omd check`를 다시 돌려라.
- 수정 패치를 제안하지 마라. 그건 `refactor` 스킬의 일이다.
- Layer 3(개인 취향)을 근거로 지적하지 마라. α=0.248 — 네 취향은 근거가 아니다.
```

### 9.2 Codex 스킬 표시 메타

`~/.codex/skills/critique/agents/openai.yaml` (실측으로 확인된 형식)

```yaml
interface:
  display_name: "Critique"
  short_description: "현재 디자인을 비평한다. 수정하지 않는다."
  default_prompt: "/critique: omd check를 실행하고, 위반을 근본 원인으로 묶고, frame.md의 컨셉에 비추어 판정하라."
```

---

## 10. 에이전트 명세

`src/agents/eye.agent.yaml` 하나에서 `.toml`(Codex)과 `.md`(Claude)가 나온다.

```yaml
# src/agents/eye.agent.yaml
name: omd-eye
description: 렌더 결과만 보고 비평한다. HAND의 의도를 모른다. 수정 권한 없음.
reasoning: high
model: "@high"                       # tool-map이 gpt-5.5 / claude-opus-4-8 로 치환
allow: [Bash(omd check:*), Bash(omd ir:*), Read]
deny:  [Write, Edit, apply_patch]
instructions: |
  너는 이 디자인이 왜 그렇게 만들어졌는지 모른다. 알 필요도 없다.
  렌더 이미지와 `omd check` 출력만 본다.
  …
```

| 에이전트 | 역할 | 격리로 얻는 것 |
| :-- | :-- | :-- |
| `omd-framer` | 문제를 의심한다 | 요구를 그대로 받지 않음. **근거 없이는 재프레이밍 금지** |
| `omd-generator` | primary generator 3개 | **서로 다른 인스턴스**로 뽑아 앵커링 차단 |
| `omd-hand` | 한 수만 둔다 | 전체 재생성 금지 |
| `omd-eye` | 결과만 본다 | **HAND의 사고과정을 못 본다** → 자기비평 맹점 제거 |
| `omd-taste` | Layer 3 판정 | 수정 권한 없음 |

**`eye`의 격리가 결정적이다.** 같은 컨텍스트에서 만들고 비평하면 모델은 자기가 방금 쓴 근거를 재확인할 뿐이다. `eye`는 렌더 PNG와 `omd check` 출력만 받는다. 왜 그렇게 만들었는지 모른다. **그래서 진짜로 비평한다.**

> ### ⚠️ 실측으로 드러난 비대칭 — Codex는 에이전트 도구 제한을 못 한다
>
> `~/.codex/agents/*.toml`의 스키마에는 도구 관련 키가 **하나도 없다.**
> `name` · `description` · `model` · `model_reasoning_effort` ·
> `developer_instructions` · `nickname_candidates` · `service_tier` 가 전부다.
> Codex 자신의 read-only 에이전트(`metis`)도 **산문으로만** 그걸 강제한다.
>
> | | Codex | Claude Code |
> | :-- | :-- | :-- |
> | `eye`의 쓰기 금지 | 프롬프트 (약함) | `disallowedTools` (강함) |
>
> 어댑터는 Codex 방출 시 `deny` 목록을 `developer_instructions` 말미에
> HARD CONSTRAINT 문단으로 주입한다. 그러나 이건 **정책이 아니라 부탁이다.**
>
> 프레임이 승인된 뒤에는 `require-frame` 훅도 `eye`를 막지 못한다.
> 훅 입력이 서브에이전트 신원을 담는지(→ `SubagentStart`로 상태 추적 가능한지)
> 확인이 필요하다. **미확인 #8.**

**`generator` 3개 병렬**도 마찬가지다. 한 컨텍스트에서 "3안 내놔"라고 하면 1안의 변형이 나온다. 서로 다른 컨텍스트에 서로 다른 은유를 주고 출발시켜야 진짜 대안이 나온다.

### 10.1 Codex 방출 형태

```toml
# ~/.codex/agents/omd-eye.toml
name = "omd-eye"
description = "렌더 결과만 보고 비평한다. HAND의 의도를 모른다. 수정 권한 없음."
model = "gpt-5.5"
model_reasoning_effort = "high"
developer_instructions = """
너는 이 디자인이 왜 그렇게 만들어졌는지 모른다. 알 필요도 없다.
…
"""
```

그리고 `config.toml`에 `[agents.omd-eye] config_file = "./agents/omd-eye.toml"`을 **반드시** 추가한다. (§5.4 — 이게 없으면 에이전트가 존재하지 않는다.)

### 10.2 framer의 하드 제약

```text
재프레이밍을 제안할 때 --why 없이는 omd frame propose 가 거부한다.
근거는 다음 중 하나여야 한다:
  · 사용자 리뷰 / 서포트 티켓 인용
  · 분석 데이터
  · 경쟁 제품의 관찰된 패턴
  · 사용자가 직접 말한 문장

"제 생각에는" 은 근거가 아니다.
```

**FRAMER가 잘난 척으로 읽히면 사람은 도구를 끈다.** 재프레이밍은 항상 **가설**로 제시하고 승인받는다. 이건 톤 지침이 아니라 CLI 레벨의 강제다.

---

## 11. `.design/` 데이터 모델

```text
.design/
  frame.md                 # 문제 정의 + primary generator + approved 플래그
  decisions.md             # "왜 그린 CTA를 기각했는가"
  taste/
    preferences.jsonl      # omd choose 가 append
    profile.md             # 추론된 취향
    vetoes.md              # "나는 절대 이건 안 해"
  rules/custom.yaml        # 팀 고유 규칙 (Layer 2)
  system/tokens.json
  reviews/2026-07-09-checkout.md
  .cache/                  # gitignore
    ir.json  shots/
```

### `frame.md`

```markdown
---
approved: true
approvedAt: 2026-07-09T18:40:00+09:00
generator: "친구의 추천"
---

## 주어진 문제
음식을 주문하는 화면을 만든다.

## 재프레이밍
사람들은 배고파서가 아니라 결정하기 싫어서 앱을 연다.
이건 주문 문제가 아니라 **선택 마비** 문제다.

## 근거
유사 앱 리뷰 표본(n=240) 최다 불만: "고를 게 너무 많다" (31%)

## 버려지는 것
무한 스크롤 카탈로그

## 얻어지는 것
3개의 제안
```

`approved: true`가 없으면 `require-frame` 훅이 모든 파일 쓰기를 차단한다.

### `preferences.jsonl`

```jsonl
{"ts":"2026-07-09T18:44:12+09:00","pair":["c2","c3"],"chose":"c3","why":"대화형이 컨셉에 맞음","frame":"친구의 추천","tags":["conversational","low-density"]}
```

**전부 git으로 추적된다**(캐시 제외). 디자인 판단이 버전 관리된다. 6개월 뒤 신입이 `decisions.md`를 읽고 *"아 그래서 여기 초록색이 없구나"*를 안다.

**호스트에 안 묶인다.** Codex로 만든 프레임을 Claude Code가 그대로 이어받는다. 이게 듀얼 타깃의 진짜 보상이다.

**클라우드는 쓰지 않는다.** 디자인 파일은 출시 전 기밀이다. 대기업 디자인팀에 팔 때 *"파일이 우리 서버로 안 나갑니다"*가 최강의 세일즈 문장이 된다. 로컬 우선은 제약이 아니라 무기다.

---

## 12. TASTE — 3층 보상

`α = 0.248`에서 곧바로 도출된다. 단일 보상 함수가 불가능하므로 층을 나눈다.

```text
┌─ Layer 3 · 개인 취향 ──────── 학습됨 · 확률적 · 사용자 소유
│    "당신은 지난 6개월간 촘촘한 레이아웃을 78% 선택했습니다"
│    출처: omd choose → .design/taste/preferences.jsonl
│    ⚠ 절대 하드코딩 금지. α=0.248이 이걸 금지한다.
│    → 쌓일수록 옮길 수 없다. 락인.
│
├─ Layer 2 · 프레임 정합성 ──── 선언됨 · 결정론적 · 팀 소유
│    "'친구의 추천' 컨셉인데 스와이프 카드는 모순입니다.
│     친구는 카드를 넘기라 하지 않습니다. 말을 겁니다."
│    출처: frame.md + rules/custom.yaml
│    → 진짜 해자. 이 팀만 쓸 수 있는 규칙.
│
└─ Layer 1 · 사용성 하한선 ──── 보편 · 결정론적 · 비용 0
     WCAG 대비 · 히트영역 · 그리드 이탈 · 미참조 토큰
     → 취향 문제가 아니다. 3:1 대비는 누구에게도 안 보인다.
     → `omd check`가 돌린다. 토큰 0.
```

**Layer 1 = 무료 · Layer 2 = 팀 플랜 · Layer 3 = 개인 락인.**
보상 구조가 그대로 과금 구조다.

`omd choose`를 부를 때마다 Layer 3이 학습된다. **제품을 쓰는 행위 자체가 취향 모델을 훈련시킨다.** 별도 라벨링 작업을 요구하지 않는다.

---

## 13. 전체 실행 예시

```text
codex> $design 음식 주문 앱          # Claude Code에선 /design
```

```text
[hook inject-design] 스킬 주입. 예산 8 iterations.

┌ omd-framer (격리 컨텍스트)
│ 주어진 문제 : 음식 주문 화면
│ 조사       : 유사 앱 리뷰(n=240) 최다 불만 "고를 게 너무 많다" 31%
│ 재프레이밍  : 카탈로그 문제가 아니라 결정 마비 문제입니다.
│              (가설입니다. 제가 틀렸을 수 있습니다.)
└ $ omd frame propose --why "리뷰 n=240, 31%"   →  approve? [y/n/수정] › y

  ※ 이 승인 전에는 require-frame 훅이 모든 파일 쓰기를 exit 2로 막았습니다.

┌ omd-generator ×3 (병렬, 서로를 못 봄)
│ A 믿음직한 회계사   B 새벽 편의점   C 친구의 추천
└ › C     → frame.md 에 generator 기록

┌ omd-hand ×3 (병렬, 각자 다른 접근)   →  $ omd render ×3  →  실제 PNG
│ c1 세로 스택·손글씨   c2 카드 스와이프   c3 대화형

┌ omd-eye (PNG + omd check 출력만 받음. HAND의 의도는 모름)
│ $ omd check --json
│ c1  Layer1 위반 2  (CONTRAST-001 2.9:1, HIT-002 38px)
│ c2  Layer1 0 · Layer2 1
│     ↳ "스와이프는 '친구의 추천'과 모순됩니다.
│        친구는 카드를 넘기라 하지 않습니다. 말을 겁니다."
│ c3  위반 0
└

┌ $ omd choose c1 c2 c3   › c3
│   → preferences.jsonl +1   (훅 불필요. CLI가 직접 쓴다)
│   Layer3 참조: 당신은 대화형 UI를 3/3 선택했습니다.
└

┌ omd-eye (2차)
│ c3는 목록 훑기가 불가능합니다. 재방문 사용자는 이미 뭘 먹을지
│ 압니다. 이건 c3의 결함이 아니라 프레임의 구멍입니다.
└

┌ REFRAME
│ 이전 : 결정 마비를 해소한다
│ 이후 : 신규는 결정 마비, 재방문은 마찰. 두 모드가 필요.
│ ⚠ 프레임이 바뀌었으므로 c1~c3은 전부 낡았습니다.
└

[hook enforce-stop] $ omd stop-check → canStop:false
                    턴을 끝낼 수 없습니다. 루프를 계속합니다. [계속/중단] ›
```

**마지막 두 블록이 이 제품의 전부다.** 어떤 경쟁 도구도 자기가 방금 만든 3안을 스스로 폐기하고 문제 정의로 돌아가지 않는다. 그게 사람이 하는 일이고, `enforce-stop`이 그걸 강제한다.

---

## 14. 미확인 항목

기획서가 침묵하기 쉬운 지점이다. **정직하게 미확인으로 남긴다.**

| # | 항목 | 위험 | 확인 방법 |
| :-- | :-- | :-- | :-- |
| 1 | **Codex `PreToolUse` 매처가 `apply_patch`를 정확히 잡는가** | 🔴 게이트가 조용히 소실 | Phase 1 첫 테스트. `omd doctor` 실동작 검증 |
| 2 | **`[hooks.state]` 키 포맷을 설치기가 계산할 수 있는가** | 🔴 매 설치마다 수동 승인 | 관측된 포맷: `<src>:<file>:<event>:<i>:<j>`. 리버스 필요 |
| 3 | Codex에 `permissions.allow` 동등물이 있는가 | 🟠 권한 프롬프트 폭탄 | `config.toml` 스키마 확인 |
| 4 | Codex plugin.json이 `agents` 키를 지원하는가 | 🟡 없어도 됨 (bare 배치로 우회) | OMO엔 없음. 문서 확인 |
| 5 | Claude plugin.json이 `agents`/`hooks` 키를 받는가 | 🟡 자동 탐색으로 추정 | OMC v4.9.3은 `skills`+`mcpServers`만 선언 |
| 6 | Codex 훅 실패(non-zero≠2) 시 정말 그냥 진행하는가 | 🔴 fail-closed 설계의 전제 | 문서엔 "에러 보고 후 계속". 실측 필요 |
| 7 | headless 렌더러 | 🟡 설계 선택 | Codex `browser` 번들 재사용 vs 자체 Playwright |
| 8 | **Codex 훅 입력이 서브에이전트 신원을 담는가** | 🟠 `eye`의 쓰기 금지가 프롬프트 수준에 머묾 | `SubagentStart` 훅으로 상태를 추적해 `PreToolUse`에서 판정 가능한지 실측 |

**1번과 2번이 최우선이다.** MCP를 뺀 대가로 게이트가 훅 하나에 걸렸다. 실물 검증 없이 넘어가면 안 된다.

---

## 15. 로드맵

### Phase 0 · 가설 검증 (3주, 플러그인 없이 프롬프트로)

| | 검증 대상 | 실패 조건 |
| :-- | :-- | :-- |
| **E1** | 재프레이밍이 실제로 가치 있는가 | 디자이너 10명 블라인드 비교. 선호 60% 미만이면 **폐기** |
| **E2** | primary generator가 제네릭 붕괴를 막는가 | 유/무 각 20안. 심사위원이 출처를 맞히는가 |
| **E3** | IR이 스크린샷보다 정말 나은가 | (a) 스샷만 (b) 스샷+IR+Violations. 비평 정확도·환각률 |
| **E4** | 개인 취향이 30샘플로 학습되는가 | 홀드아웃 20건 예측 |

> **E4의 기준선이 미묘하다.** 사람도 자기 자신과 완벽히 일치하지 않는다.
> 같은 쌍을 이틀 뒤 다시 보여줘 **개인 내 일관성(test-retest)**을 먼저 재고 그걸 상한으로 삼는다.
> **α = 0.248은 타인 간 일치도지 상한이 아니다.** 그걸 넘겠다는 건 착각이다.

**E1이 실패하면 이 기획의 전제가 무너진다.** 그러면 루프를 포기하고 관찰·비평 전용 플러그인(Phase 2만)으로 축소한다. 후퇴가 아니라 정상적인 결과다.

### Phase 1 · 듀얼 타깃 골격 (3주)

`omd check` **하나만.** + `npx install` + 어댑터 2종 + `require-frame` 훅 + `omd doctor`.

**성공 기준 (둘 다 필수)**

1. 같은 `.design/rules/custom.yaml`이 Codex와 Claude Code에서 **동일한 Violation**을 낸다.
2. **양쪽에서 승인 없는 파일 쓰기가 실제로 차단된다.** (§14 #1 검증)

### Phase 2 · `observe` + `critique` (6주) — 무료

`omd ir`, `omd render`. 스킬 2개. **쓰기 없음.** 읽기 전용은 위험이 0이고, 신뢰는 여기서 산다.
성공 기준: 사용자가 리포트를 팀 슬랙에 스스로 붙여넣는다.

### Phase 3 · `frame` + 게이트 (6주)

`omd-framer`, `frame.md`, `omd apply`.
**아직 생성하지 않는다.** 디자이너가 직접 그린다. 플러그인은 문제를 잡아주고 관점을 지킨다.
성공 기준: 사용자가 `.design/`를 레포에 커밋한다. → 자산화 완료.

### Phase 4 · 루프 (10주)

`omd-hand`, `omd-eye`, DIVERGE/CULL, `enforce-stop`.
쓰기 진입. **dry-run 기본. 스냅샷·되돌리기 필수.**
성공 기준: 첫 100회 적용에서 파일 파손 0건.

### Phase 5 · TASTE (8주) — 유료

`omd choose` 로그 축적 → Layer 3 모델. 팀 룰(Layer 2) 판매.

### Phase 6 · 마켓플레이스

양쪽 동시 공개. 커뮤니티가 `rules/` 팩과 primary generator 팩을 올린다.
**"Linear 밀도 룰팩", "Apple 여백 룰팩"**이 유통되면 생태계가 된다.

---

## 16. 리스크

| 리스크 | 심각도 | 대응 |
| :-- | :-- | :-- |
| **FRAMER가 잘난 척으로 읽힘** | 🔴 최상 | 재프레이밍은 항상 **가설**로 제시하고 승인받는다. `--why` 없으면 CLI가 거부 |
| **프레임 게이트가 짜증 유발** | 🔴 최상 | 게이트는 강력하고, 강력한 건 거슬린다. `--no-frame` 탈출구 필수. 기본값은 게이트 |
| **훅 미설치 = 게이트 소실** | 🔴 최상 | MCP를 뺀 대가. `omd doctor`가 **실동작으로** 검증. `omd apply`가 2차 방어 |
| **`omd`가 크래시하면 게이트 무력화** | 🔴 최상 | fail-closed. 모든 예외를 잡아 exit 2로 넘어뜨린다 |
| **에이전트가 스스로 프레임을 승인** | 🔴 최상 | 실측으로 확인됨(§3.3). TTY + 근거 요구로 완화. **airtight 아님** |
| **셸 리다이렉션이 매처를 우회** | 🔴 최상 | 사전 차단 불가(§3.4①). `Stop` 훅의 사후 회계로 검출 |
| **게이트가 무관한 파일까지 차단** | 🟠 중상 | 훅 핸들러가 경로로 판정. `scope.yaml`로 팀이 범위 지정(§3.4②) |
| 매처 오타로 게이트 무력화 | 🔴 상 | `omd doctor`가 실제로 쓰기를 시도해 차단을 확인 |
| Codex 훅 해시 재승인 지옥 | 🔴 상 | 훅 JSON을 불변 shim으로 고정. 로직은 CLI에 |
| 재프레이밍이 그냥 틀림 | 🔴 상 | 근거 인용 없으면 재프레이밍 **금지**. framer 프롬프트 + CLI 이중 제약 |
| 취향이 30샘플로 안 됨 | 🔴 상 | E4에서 먼저 확인. 안 되면 명시적 취향 인터뷰(`profile.md` 수기)로 대체 |
| Bash 권한 프롬프트 폭탄 | 🟠 중상 | 설치 시 allowlist. Codex 동등물은 미확인(§14 #3) |
| 루프 비용 폭발 | 🟡 중 | `omd stop-check`에 하드 예산 상한 |
| 설치기가 사용자 설정을 망침 | 🟡 중 | 백업 → 마커 블록 → 머지(덮어쓰기 금지) → `uninstall`로 정확히 되돌림 |
| Figma가 직접 만든다 | 🟡 중 | 그들은 "평균 취향" 밖으로 못 나온다. 개인 취향 파일 · 로컬 우선 · 커스텀 룰 |
| 디자이너가 CLI를 안 씀 | 🟡 중 | 1차 타겟은 **디자인 겸업 개발자**. Figma 패널은 Phase 4 이후 |

**위 넷이 전부 같은 뿌리다.** MCP 서버는 스스로 거부할 수 있었지만, 훅은 안 돌면 그만이다. 그래서 `omd doctor`가 **선언이 아니라 관측으로** 게이트를 검증해야 하고, 훅 핸들러는 **죽더라도 막으면서 죽어야** 한다.

---

## 17. 한 문장으로

> 코드에는 린터·리뷰어·테스트가 있다. 디자인에는 없다.
> 그런데 디자인에 필요한 건 린터가 아니라 **루프**다.
>
> 사람처럼 디자인한다는 건 좋은 화면을 뽑는 게 아니라
> **문제를 의심하고, 관점을 세우고, 한 수 두고, 보고, 문제를 갈아엎는 것**이다.
>
> "좋다"에 보편 함수가 없으므로(α = 0.248),
> 유일하게 가능한 목표는 **당신의 취향을 배우는 것**이다.

**계산은 CLI가 하고, 권유는 스킬이 하고, 강제는 훅이 한다.**
**LazyCodex가 Codex에 한 일을, 우리는 두 호스트에 한다.**

---

## 부록 · 근거

### 디자인 인지

- Schön, *The Reflective Practitioner* — see-move-see, 재료와의 반성적 대화
- [Dorst & Cross, *Creativity in the design process: co-evolution of problem–solution*](https://www.sciencedirect.com/science/article/pii/S0142694X01000096)
- [Understanding Design Cognition (Springer)](https://link.springer.com/chapter/10.1007/978-1-4471-7541-4_7) — Darke의 primary generator
- [Beyond Problem Solving: Framing and Problem–Solution Co-Evolution](https://arxiv.org/html/2508.07058v1) — 전문가는 재프레이밍하고, 초보자는 주어진 문제를 푼다
- [Problem framing and cognitive style](https://www.sciencedirect.com/science/article/abs/pii/S0142694X21000260)

### 취향과 보상 — 이 계획의 핵심 근거

- [DesignPref](https://arxiv.org/abs/2511.20513) — 디자이너 20명 · 12k 페어와이즈 · **α = 0.248** · 28.5%가 96%+ 불일치
- [TASTE: Designer-Annotated Multi-Dimensional Preference Dataset](https://arxiv.org/html/2605.20731v2)
- [UI-Bench: Evaluating Design Capabilities of AI Text-to-App Tools](https://arxiv.org/pdf/2508.20410)
- [Code Aesthetics with Agentic Reward Feedback](https://arxiv.org/html/2510.23272v1)

### 생성과 비평

- [Design2Code](https://arxiv.org/abs/2403.03163) — 484개 실제 웹페이지
- [Visual Prompting with Iterative Refinement for Design Critique Generation](https://arxiv.org/pdf/2412.16829) — 비평 + 바운딩 박스 동시 정제
- [A Survey on the Feedback Mechanism of LLM-based AI Agents](https://www.ijcai.org/proceedings/2025/1175.pdf) — 비평과 수정의 분리가 유효
- [UI2Code^N: UI-to-Code as Interactive Visual Optimization](https://arxiv.org/html/2511.08195v3)

### 합성 사용자 (Layer 1 확장)

- [UXAgent: LLM Agent-Based Usability Testing Framework](https://arxiv.org/pdf/2502.12561)
- [PerceptUI: LLM Agents as Human-Aligned Synthetic Users](https://arxiv.org/pdf/2606.05697)

### 시장

- [Google Stitch vs v0 vs Figma AI: Tested on Real Production UI Tasks](https://ortemtech.com/blog/ai-design-tools-comparison-2026-figma-v0-google-stitch/)
- [Google Stitch Review 2026](https://www.nocode.mba/articles/google-stitch-review) — *"프로토타입엔 괜찮지만 클라이언트엔 못 보여준다"*

### 호스트 스펙

- [Codex Hooks](https://developers.openai.com/codex/hooks) — 10개 라이프사이클 이벤트, `exit 2` 차단, `permissionDecision`/`additionalContext`/`continue:false`
- [Codex Config Reference](https://developers.openai.com/codex/config-reference)
- [lazycodex](https://github.com/code-yeongyu/lazycodex) · [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — npx 래퍼가 `omo install --platform=codex`를 spawn. **Claude Code는 "아직 제공되지 않음"**

### 로컬 실측 (2026-07-09)

- `codex-cli 0.142.2` — `~/.codex/config.toml`의 `[features]` · `[agents.<n>] config_file` · `[hooks.state.<key>] trusted_hash`
- OMO v4.15.1 — `.codex-plugin/plugin.json` (`skills` · `hooks[]` · `mcpServers` · `interface`; **`agents` 키 없음**)
- `~/.codex/skills/<n>/SKILL.md` + `agents/openai.yaml` (`interface.display_name` · `default_prompt`)
- oh-my-claudecode v4.9.3 — `.claude-plugin/plugin.json` (`skills` · `mcpServers`)
- `~/.claude/settings.json` — `permissions` · `hooks` · `enabledPlugins` · `extraKnownMarketplaces`
