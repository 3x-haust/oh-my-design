# Oh My Design

[![CI](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml/badge.svg)](https://github.com/3x-haust/oh-my-design/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%403xhaust%2Foh-my-design)](https://www.npmjs.com/package/@3xhaust/oh-my-design)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**사람처럼 디자인하는 AI.** 명령 하나에 한 줄 요청을 적으면 OMD가 새 마케팅 페이지, 여러 화면의
새 제품, 또는 기존 서비스의 리디자인을 만들고, 맥락 없는 바깥 눈에게 보인 뒤 멈춰서 보여줍니다.

[English](README.md)

## 명령 하나

| 호스트 | 입력 |
| --- | --- |
| Pi | `/skill:omd-ultradesign <요청>` |
| Claude Code | `/oh-my-design:ultradesign <요청>` |
| Codex | `$omd-ultradesign <요청>` |

입력하는 것은 이것뿐입니다. 나머지는 모두 그 안에서 돌아갑니다.

## 한 번의 실행

한 사이클은 프로젝트와 요청을 읽고, 레퍼런스를 모으고, 자체 에셋을 만들고, 핵심 화면을 프로젝트의
실제 코드로 만든 뒤 데스크톱과 폰 폭으로 렌더합니다. 그 캡처와 실제 완성작 하나만 보는 새 리뷰어가
시니어 디자이너가 만들지 않았다는 가장 큰 흔적을 짚습니다.

그다음 멈추고 결과 위치와 여는 방법, 리뷰어의 지적, 배운 것을 적은 짧은 메모, 다음 사이클이 버리고
다시 만들 것을 보여줍니다. 같은 명령 뒤에 답합니다.

- `one more`: 한 사이클 더 돌고 다시 멈춥니다.
- `continue`: 리뷰어가 아무것도 찾지 못하거나 3번째 사이클에 이를 때까지 계속합니다.
- `continue without stopping: <요청>`: 처음부터 멈추지 않고 도는 새 요청을 시작합니다.

각 사이클은 메모, 살아남은 에셋, 고른 레퍼런스만 가진 깨끗한 대화에서 시작합니다. Pi에서는 새
세션이 저절로 열리고, Claude Code나 Codex에서는 새 세션(`/clear` 또는 새 채팅)을 열고 같은 명령을
다시 입력합니다. 디자인 선택은 모두 OMD가 하고, 사용자는 계속할지만 정합니다.

## 설치

### npm

```bash
npm install -g @3xhaust/oh-my-design
oh-my-design install
oh-my-design doctor
```

npm의 스코프 없는 `oh-my-design`은 다른 프로젝트입니다. `oh-my-design uninstall`은 호스트 설치만
되돌리고 프로젝트의 `.omd/` 기록은 지우지 않습니다.

### Pi 호환 호스트

```bash
pi install npm:@3xhaust/oh-my-design
```

### Claude Code 마켓플레이스

```text
/plugin marketplace add 3x-haust/oh-my-design
/plugin install oh-my-design@omd
```

### 소스에서 설치

```bash
git clone https://github.com/3x-haust/oh-my-design
cd oh-my-design
npm install
node bin/omd-install.ts install
```

## 브라우저 지원

OMD는 지원되는 Darwin arm64와 Linux x64에서 검증된 `browser-rs`를 우선 쓰고, Playwright + Chromium으로
폴백합니다. Chromium이 없으면 `npx playwright install chromium`을 실행합니다.

## 개발

프롬프트 정본은 `src/skills/omd-ultradesign/SKILL.md`와 `src/agents/`입니다. `skills/`, `agents/`,
`dist/`는 `npm run build`가 생성하므로 직접 수정하지 않습니다.

저장소 변경의 완료 조건:

```bash
npx tsc --noEmit
npm run build
npm test
```

커밋은 conventional prefix를 사용합니다. 릴리스와 버전 변경은 명시적으로 요청받았을 때만 합니다.
