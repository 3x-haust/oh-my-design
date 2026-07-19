# LEGO reference assembly and browser-provider capability audit

This is a code-first audit of the chat-first LEGO reference-assembly request. Source paths name
source of truth, not generated `dist/`. The final source, generated-output, package reinstall,
host/project doctor, and live browser-rs smoke gates recorded below passed; this document is not
a release claim.

## Status vocabulary / 상태 용어

| Classification / 분류 | Meaning / 의미 | Current interpretation / 현재 해석 |
| --- | --- | --- |
| **Already existed / 기존 기능** | KO: 이 작업 전부터 OMD가 제공하던 계약 또는 런타임입니다.<br>EN: An OMD contract or runtime that predates this task. | KO: 유지하며 레고 프로토콜의 입력 또는 폴백으로 연결했습니다.<br>EN: Retained and connected as a LEGO-protocol input or fallback. |
| **Newly implemented / 신규 구현** | KO: 이 작업에서 추가된 닫힌 기록, 검증기, CLI 표면 또는 설치 경로입니다.<br>EN: A closed record, validator, CLI surface, or install path added in this task. | KO: 소스·행동 테스트와 이 작업공간의 최종 설치/라이브 공급자 검증을 통과했습니다. 모든 외부 사이트·플랫폼 호환성을 주장하지는 않습니다.<br>EN: Source/behavioural tests and this worktree's final installed/live-provider verification passed. This does not claim compatibility with every external site or platform. |
| **Fallback / 폴백** | KO: 능력 또는 플랫폼이 없을 때 명시적으로 선택하는 경로입니다.<br>EN: An explicit route selected when a capability or platform is unavailable. | KO: 실패를 숨기지 않으며, 원본 픽셀을 입력으로 바꾸지 않습니다.<br>EN: It does not hide failure or turn source pixels into inputs. |
| **Intentionally out of scope / 의도적 범위 제외** | KO: 요구와 충돌하거나 안전 경계를 깨므로 추가하지 않는 기능입니다.<br>EN: A capability intentionally not added because it conflicts with the request or a safety boundary. | KO: 보드 UI, `omd-board`, 원격 스크래핑/핫링크, 새 이미지 공급자/API 키 계층, 새 3D 런타임이 여기에 속합니다.<br>EN: Board UI, `omd-board`, remote scraping/hotlinking, a new image-provider/API-key layer, and a new 3D runtime are excluded. |

## Capability matrix / 기능 매트릭스

| Requirement / 요구사항 | Before → current status / 이전 → 현재 상태 | Exact source or evidence / 정확한 근거 경로 | Gap / 한계 | Implemented change or fallback / 구현 변경 또는 폴백 | Behavioural verification / 동작 검증 |
| --- | --- | --- | --- | --- | --- |
| KO: 전체 사이트 모방 대신 확정 브리프에 맞는 레고식 부품 선택<br>EN: Choose brief-fit LEGO parts instead of copying one whole site. | KO: 기존 측정 레퍼런스에서 신규 후보 조립 계약으로 확장되었습니다.<br>EN: Existing measured references are extended by a new candidate-assembly contract. | `core/ref/board-contract.ts`; `core/protocol/reference-assembly.md` | KO: 제품 전략을 자동 결정하지 않습니다.<br>EN: It does not automatically decide product strategy. | KO: 브리프 블록, 과업 ID, 이유, take/avoid, adaptation으로 선택을 기록합니다.<br>EN: It records selection through brief blocks, task IDs, reason, take/avoid, and adaptation. | `test/ref-board.test.ts`; `test/ref-candidates-cli.test.ts` |
| KO: 검색·필터·카드·CTA·폼·대시보드·타입·색·공간·텍스처·반응형을 필요한 부품으로 분석<br>EN: Analyse search, filters, cards, CTA, forms, dashboards, type, colour, space, texture, and responsive behaviour as needed parts. | KO: 기존 `ref add`에 신규 selector 범위 컴포넌트와 후보 조립을 결합했습니다.<br>EN: Existing `ref add` is combined with new selector-scoped components and candidate assembly. | `bin/omd.ts`; `core/ref/store.ts`; `core/ref/board.ts` | KO: 검색 등 특정 서비스의 고정 분류법은 제공하지 않습니다.<br>EN: No fixed taxonomy is imposed for a service such as search. | KO: 탐색/즉답, 속도/깊이, 밀도, 필터, 브랜드 판단은 브리프와 부품 이유에 명시합니다.<br>EN: Exploration/answer, speed/depth, density, filters, and brand judgment are stated in the brief and piece rationale. | `test/ref-board.test.ts`; `test/ref-candidates-cli.test.ts` |
| KO: 특정 컴포넌트 영역을 blueprint와 로컬 PNG로 캡처<br>EN: Capture an exact component region as a blueprint plus local PNG. | KO: 페이지 측정에서 신규 selector 범위 캡처로 확장되었습니다.<br>EN: Page measurement is extended by new selector-scoped capture. | `bin/omd.ts` (`ref add --selector --blueprint --shot`); `core/ref/board-security.ts` | KO: 캡처는 근거이며 배포 자산이 아닙니다.<br>EN: A capture is evidence, not a shipped asset. | KO: browser-rs가 가능하면 우선 캡처하고, 실패 뒤에만 결정적 Playwright 경로를 씁니다.<br>EN: Use browser-rs first when capable; use the deterministic Playwright path only after failure. | `test/ref-shot.test.ts`; `test/ref-board-png-security.test.ts` |
| KO: Pinterest류 이미지를 사용자가 지정해 캡처하고 출처·권리를 기록<br>EN: User-direct a Pinterest-like capture and record provenance/rights. | KO: 신규 `image-fragment-v1`이 로컬 PNG와 출처를 결속합니다.<br>EN: New `image-fragment-v1` binds a local PNG to provenance. | `core/ref/image-fragment.ts`; `core/ref/image-fragment-parser.ts`; `bin/omd.ts`; `adapters/browser-mcp.ts` | KO: importer는 원격 페이지·이미지를 fetch/스크래핑/핫링크하지 않고 라이선스를 추론하지 않습니다. browser-rs 탐색·캡처는 사용자가 지정한 대화형 브라우징 위치·영역에서만 할 수 있습니다.<br>EN: The importer does not fetch, scrape, or hotlink remote pages/images and does not infer a licence. browser-rs may navigate/capture only a user-directed location and region in an interactive browsing session. | KO: `sourcePage`, 선택 `sourceImage`, `captureRegion`, 선택 `cropBox`, `licenseStatus`, rights, visual role, principles, 시간을 기록하고 로컬 PNG만 가져옵니다.<br>EN: It records `sourcePage`, optional `sourceImage`, `captureRegion`, optional `cropBox`, `licenseStatus`, rights, visual role, principles, and time, then imports only the local PNG. | `test/ref-image-fragment.test.ts`; `test/browser-rs-smoke.test.ts` |
| KO: 출처·페이지·영역·적용 대상·브리프 연결·이유·차용/비차용·변환을 추적<br>EN: Trace source/page/region/target/brief link/reason/take/avoid/transformation. | KO: 후보 의도와 실제 사용을 분리하는 신규 usage ledger가 추가되었습니다.<br>EN: A new usage ledger separates candidate intent from actual use. | `core/ref/board-artifacts.ts`; `core/ref/reference-usage.ts`; `core/ref/reference-report.ts` | KO: 후보에 있다고 해서 배포에 영향을 주었다는 뜻은 아닙니다.<br>EN: Presence in a candidate does not prove production influence. | KO: 모든 선택 슬롯은 `used`, `rejected`, `anti-reference` 중 하나와 프로덕션 근거를 받습니다.<br>EN: Every selected slot gets `used`, `rejected`, or `anti-reference` plus production evidence. | `test/reference-usage.test.ts`; `test/reference-report.test.ts` |
| KO: 원본을 복제하지 않고 원리·비율·밀도·리듬·모션을 재구성<br>EN: Reconstruct principles, proportion, density, rhythm, and motion rather than copy sources. | KO: 기존 거리/귀속 경계에 신규 정제 assembly가 추가되었습니다.<br>EN: New sanitised assembly is added to the existing distance/attribution boundary. | `core/ref/board-projection.ts`; `core/ref/board-sanitization.ts` | KO: 정제가 저작권 판단을 대신하지는 않습니다.<br>EN: Sanitisation does not replace copyright judgment. | KO: 원본 URL·호스트·정체성·**원본 selector**·provenance·경로·픽셀은 제거하지만, 구현 매핑용 **대상 `targetSelector`**는 의도적으로 유지합니다.<br>EN: It strips source URL/host/identity/**source selector**/provenance/path/pixels, while intentionally retaining the **target `targetSelector`** for implementation mapping. | `test/ref-board-transfer.test.ts`; `test/ref-board-contamination.test.ts` |
| KO: 여러 후보를 채팅에서 비교하고 한 개를 선택<br>EN: Compare multiple candidates in chat and select one. | KO: 신규 hash-bound selection과 채팅용 Markdown이 추가되었습니다.<br>EN: New hash-bound selection and chat-ready Markdown are added. | `core/ref/candidate-markdown.ts`; `core/ref/reference-selection.ts`; `bin/omd.ts` | KO: 별도 시각 보드나 사용자용 선택 앱은 없습니다.<br>EN: There is no separate visual board or user-facing selection app. | KO: `omd ref candidates`가 후보 표를 출력하고 coordinator가 대화 선택을 `omd ref select`로 기록합니다.<br>EN: `omd ref candidates` emits the table and the coordinator records the chat choice with `omd ref select`. | `test/ref-candidates-cli.test.ts`; `test/reference-selection.test.ts` |
| KO: 구현 전에 클린룸 합성 시안 또는 정직한 미사용 기록<br>EN: Create a clean-room composite before implementation or an honest unavailable record. | KO: 스크린샷 시드 지시에서 신규 lineage 계약으로 전환되었습니다.<br>EN: Screenshot-seeded instruction is replaced by a new lineage contract. | `core/ref/composite-lineage.ts`; `core/ref/composite-lineage-files.ts` | KO: 원본 캡처 콜라주나 원본 픽셀 생성기는 없습니다.<br>EN: There is no source-capture collage or source-pixel generator. | KO: 가능한 호스트는 정제 assembly로 2~3개 독립 초안을 병렬 생성하고, 불가능하면 `unavailable` 및 CSS/SVG/근거 폴백을 기록합니다.<br>EN: A capable host generates 2–3 independent drafts concurrently from sanitised assembly; otherwise it records `unavailable` and uses CSS/SVG/evidence fallback. | `test/ref-composite-lineage.test.ts`; `test/ref-board-contamination.test.ts` |
| KO: 실제 카피·데스크톱/모바일·구현 결과를 반복 검증<br>EN: Iterate against real copy, desktop/mobile, and implementation results. | KO: 기존 OMD 렌더·프로브·타이포그래피·반응형 증명을 유지하고, 패키지 실행에서 페이지 callback이 직렬화되도록 좁은 런타임 경계를 보완했습니다.<br>EN: Existing OMD render, probe, typography, and responsive proofs remain; a narrow runtime seam now serializes page callbacks for packaged execution. | `core/render/index.ts`; `core/probe/index.ts`; `core/protocol/human-design-loop.md` | KO: 실제 브라우저 검증에는 준비된 런타임이 필요합니다.<br>EN: Real browser verification needs a ready runtime. | KO: 레퍼런스 프로토콜은 기존 검증 루프의 입력을 정제합니다. 보완된 callback 직렬화는 패키지된 selector 캡처를 가능하게 하지만 렌더/프로브의 사용자 동작이나 폴백 정책을 바꾸지 않습니다.<br>EN: The reference protocol sanitises inputs to the existing loop. The callback-serialization correction enables packaged selector capture without changing render/probe user behavior or fallback policy. | `test/render-proofs.test.ts`; `test/cli.test.ts`; `test/packed-bin-runtime.test.ts` |
| KO: 이미지·2D/3D 조형물 후보와 애니메이션을 파이프라인에 포함<br>EN: Include image/2D/3D candidates and animation in the pipeline. | KO: 기존 host image-generation·모션·reduced-motion·WebGL 게이트를 유지합니다.<br>EN: Existing host image-generation, motion, reduced-motion, and WebGL gates remain. | `core/theory/imagegen.md`; `core/motion/`; `core/rules/motion-spec.ts` | KO: 새 이미지 제공자/API 키 관리자/3D 런타임은 추가하지 않습니다.<br>EN: No new image provider/API-key manager/3D runtime is added. | KO: 이미지 기능이 없으면 CSS/SVG 폴백을 쓰고, 모션·접근성·성능·3D 적용성 게이트는 그대로 둡니다.<br>EN: Use CSS/SVG fallback when image capability is absent; keep motion, accessibility, performance, and 3D applicability gates unchanged. | `test/motion.test.ts`; `test/motion-spec.test.ts` |
| KO: browser-rs-mcp를 레퍼런스 조사·캡처·QA의 우선 브라우저로 사용<br>EN: Use browser-rs-mcp first for reference research, capture, and QA. | KO: 기존 Playwright 경로에 신규 `browser-rs` MCP 런처를 추가했습니다.<br>EN: A new `browser-rs` MCP launcher is added beside the existing Playwright path. | `adapters/browser-mcp.ts`; `core/install/browser-provider.ts`; `core/protocol/reference-assembly.md` | KO: browser-rs v0.1.10은 성숙도와 플랫폼 범위가 좁은 외부 제공자입니다.<br>EN: browser-rs v0.1.10 is a narrow-maturity, narrow-platform external provider. | KO: 초기화/기능 실패 뒤에만 headless reduced-motion `omd render`/`omd probe` Playwright 폴백을 사용합니다.<br>EN: Use headless reduced-motion `omd render`/`omd probe` Playwright fallback only after initialisation/capability failure. | `test/browser-mcp-launcher.test.ts`; `test/browser-rs-smoke.test.ts` |
| KO: browser-rs를 안전하게 설치·검사·제거하고 외부 바이너리를 보존<br>EN: Install/doctor/uninstall browser-rs safely while preserving foreign binaries. | KO: 신규 v0.1.10 pin, receipt, 소유권 확인, 명시적 browser 명령이 추가되었습니다.<br>EN: New v0.1.10 pins, receipt, ownership check, and explicit browser commands are added. | `core/install/browser-rs.ts`; `core/install/browser-rs-download.ts`; `core/install/browser-rs-receipt.ts`; `bin/omd-install.ts` | KO: Darwin arm64·Linux x64 외에는 지원하지 않으며, 다운로드 실패는 healthy가 아닙니다.<br>EN: Only Darwin arm64/Linux x64 are supported; a download failure is not healthy. | KO: `OMD_BROWSER_RS_BIN` → `PATH` → receipt 소유 대상 순서이며, 외부/무영수증/변조 파일은 덮어쓰거나 제거하지 않습니다.<br>EN: Resolution is `OMD_BROWSER_RS_BIN` → `PATH` → receipt-owned target; foreign/unreceipted/tampered files are not overwritten or removed. | `test/browser-rs-install.test.ts`; `test/browser-rs-install-security.test.ts`; `test/browser-rs-download.test.ts` |
| KO: Playwright를 보조 수단이자 런타임 패키지로 유지<br>EN: Retain Playwright as fallback and runtime package. | KO: Playwright가 dev-only에서 runtime `dependencies`로 이동했습니다.<br>EN: Playwright moved from dev-only to runtime `dependencies`. | `package.json`; `core/install/browser-provider.ts`; `core/render/index.ts`; `core/probe/index.ts` | KO: Chromium은 자동 다운로드되지 않습니다.<br>EN: Chromium is not auto-downloaded. | KO: 지원하지 않는 플랫폼에서는 Playwright 모듈과 Chromium이 모두 준비되어야 healthy입니다.<br>EN: On unsupported platforms, both the Playwright module and Chromium must be ready for healthy status. | `test/packed-playwright.test.ts`; `test/packed-bin-runtime.test.ts` |
| KO: 채팅 우선 공개 표면과 source-of-truth 규율 유지<br>EN: Preserve the chat-first public surface and source-of-truth discipline. | KO: 보드 ABI는 내부로 추가되었고 공개 bin은 기존 둘만 유지됩니다.<br>EN: The board ABI is new and internal; only the two existing public bins remain. | `package.json`; `bin/omd.ts`; `bin/omd-install.ts`; `core/ref/candidate-markdown.ts`; `core/ref/reference-report.ts` | KO: `omd-board`, DESIGN UI, HTML/PNG 보드, 원격 스크래핑, 핫링크는 범위 밖입니다.<br>EN: `omd-board`, DESIGN UI, HTML/PNG boards, remote scraping, and hotlinking are out of scope. | KO: Codex/Claude는 후보와 최종 한/영 Markdown 표를 직접 채팅에 표시합니다.<br>EN: Codex/Claude presents the candidate and final bilingual Markdown tables directly in chat. | `test/ref-candidates-cli.test.ts`; `test/reference-report.test.ts` |

## Artifact and boundary matrix / 산출물·경계 매트릭스

| Stage / 단계 | Owner / 소유자 | Durable, cache, or chat output / 내구·캐시·채팅 산출물 | Raw versus sanitised boundary / 원시·정제 경계 | Validator or command / 검증기 또는 명령 |
| --- | --- | --- | --- | --- |
| KO: brief blocks<br>EN: brief blocks | KO: framer<br>EN: framer | KO: 내구 `.omd/frame.md`<br>EN: Durable `.omd/frame.md` | KO: 사용자 브리프와 인용 근거만 허용합니다.<br>EN: Accepts only user brief and cited evidence. | `omd frame set`; `omd frame show` |
| KO: actual-copy deck and copy-eye revision<br>EN: actual-copy deck and copy-eye revision | KO: writer, then copy-eye context<br>EN: writer, then copy-eye context | KO: 내구 `.omd/copy-deck.md`; 캐시 `.omd/.cache/copy-eye.md`<br>EN: Durable `.omd/copy-deck.md`; cache `.omd/.cache/copy-eye.md` | KO: 실제 카피의 각 배포 사실은 verified fact ID를 가리키며, eye는 정제 브리프·덱·fact ledger·voice 근거만 봅니다.<br>EN: Each shipped actual-copy fact points to a verified fact ID; eye sees only sanitised brief, deck, fact ledger, and voice evidence. | KO: 첫 `omd copy --check` → copy-eye 보고서 → 변경되지 않은 reviewed hash에 대한 `omd copy --review-check` → writer 수정 → 최종 `omd copy --check`.<br>EN: Initial `omd copy --check` → copy-eye report → `omd copy --review-check` against unchanged reviewed hash → writer revision → final `omd copy --check`. `core/copy/index.ts`; `test/copy.test.ts` |
| KO: fragment inventory<br>EN: fragment inventory | KO: scout<br>EN: scout | KO: 내구 `.omd/refs/`, `.omd/refs/fragments/`; scout-local raw captures<br>EN: Durable `.omd/refs/`, `.omd/refs/fragments/`; scout-local raw captures | KO: URL·캡처·PNG·provenance는 scout 경계에 머뭅니다.<br>EN: URLs, captures, PNGs, and provenance stay at the scout boundary. | `omd ref add`; `omd ref import-image`; image/PNG validators |
| KO: brick analysis<br>EN: brick analysis | KO: scout<br>EN: scout | KO: 내구 `.omd/scout.md`와 정제된 원칙<br>EN: Durable `.omd/scout.md` and sanitised principles | KO: transferable principles만 다음 단계로 갑니다.<br>EN: Only transferable principles cross downstream. | `omd ref principles`; `omd ref check` |
| KO: candidate assemblies<br>EN: candidate assemblies | KO: scout<br>EN: scout | KO: 내부 내구 `.omd/reference-board.json`; 채팅 후보 표<br>EN: Internal durable `.omd/reference-board.json`; chat candidate table | KO: 원시 보드는 출처 정체성과 증거를 보유하고, 정제 assembly는 소스 정체성·원본 selector·provenance·픽셀을 제거하며 대상 `targetSelector`는 유지합니다.<br>EN: Raw board retains source identity/evidence; sanitised assembly strips source identity/source selector/provenance/pixels while retaining target `targetSelector`. | `omd ref check`; `omd ref candidates` |
| KO: selected assembly<br>EN: selected assembly | KO: coordinator<br>EN: coordinator | KO: 내구 `.omd/reference-selection.json`; canonical sanitised bytes are internal/cache-only, not a standalone user file<br>EN: Durable `.omd/reference-selection.json`; canonical sanitised bytes are internal/cache-only, not a standalone user file | KO: 선택은 raw board와 정제 assembly 해시를 결속하지만 원시 데이터를 복사하지 않습니다.<br>EN: Selection binds raw-board and sanitised-assembly hashes without copying raw data. | `omd ref select`; `omd ref check` |
| KO: clean-room composite<br>EN: clean-room composite | KO: coordinator<br>EN: coordinator | KO: 내구 `.omd/reference-composite-lineage.json`; 캐시 `.omd/.cache/imagegen/`; 또는 `unavailable` 기록<br>EN: Durable `.omd/reference-composite-lineage.json`; cache `.omd/.cache/imagegen/`; or `unavailable` record | KO: 정제 assembly와 허용된 프로젝트 소유 입력만 쓰며 원본 픽셀·스크린샷·likeness를 금지합니다.<br>EN: Uses only sanitised assembly/permitted project-owned inputs; forbids source pixels, screenshots, and likeness. | `recordReferenceCompositeLineage`; `checkReferenceCompositeLineage` |
| KO: production usage ledger<br>EN: production usage ledger | KO: hand<br>EN: hand | KO: 내구 `.omd/reference-usage.json`<br>EN: Durable `.omd/reference-usage.json` | KO: 실제 프로덕션 경로·selector·검증 메모가 원본 영향 주장을 제한합니다.<br>EN: Actual production path/selector/verification note constrain influence claims. | `recordReferenceUsage`; `validateReferenceUsage` |
| KO: final provenance report<br>EN: final provenance report | KO: finalizer (coordinator responsibility)<br>EN: finalizer (coordinator responsibility) | KO: 내구 `.omd/reference-report.md`와 같은 채팅 Markdown<br>EN: Durable `.omd/reference-report.md` and identical chat Markdown | KO: formatter가 검증된 usage/lineage/attribution만 결합합니다.<br>EN: Formatter joins only validated usage, lineage, and attribution. | `generateReferenceReport` |

## Role and handoff matrix / 역할·인계 매트릭스

| Role / 역할 | Sole output / 단일 산출물 | Boundary / 경계 | Check or handoff / 검사 또는 인계 |
| --- | --- | --- | --- |
| KO: framer<br>EN: framer | KO: `.omd/frame.md`의 brief blocks<br>EN: Brief blocks in `.omd/frame.md` | KO: 캡처·후보·선택·보고서를 만들지 않습니다.<br>EN: Does not capture, assemble candidates, select, or report. | `omd frame set/show` → scout |
| KO: writer<br>EN: writer | KO: `.omd/copy-deck.md`의 실제 카피와 fact ledger<br>EN: Actual copy and fact ledger in `.omd/copy-deck.md` | KO: writer만 덱을 바꾸며 fixture/open fact는 배포 카피를 뒷받침하지 못합니다. copy eye는 코드·렌더·레이아웃·작성자를 보지 않습니다.<br>EN: Only writer changes the deck; fixture/open facts cannot support shipped copy. Copy eye sees no code, render, layout, or authorship. | KO: `omd copy --check` → copy-eye 보고서 → 변경되지 않은 reviewed hash에 대한 `omd copy --review-check` → writer 수정 → 최종 `omd copy --check`.<br>EN: `omd copy --check` → copy-eye report → `omd copy --review-check` against unchanged reviewed hash → writer revision → final `omd copy --check`. `src/agents/writer.agent.yaml`; `test/copy.test.ts` |
| KO: scout<br>EN: scout | KO: fragment inventory, brick analysis, internal candidates, chat candidate table<br>EN: Fragment inventory, brick analysis, internal candidates, chat candidate table | KO: 원시 URL·캡처·픽셀·source prose는 downstream에 넘기지 않습니다.<br>EN: Does not pass raw URLs, captures, pixels, or source prose downstream. | `omd ref check/candidates` → coordinator |
| KO: coordinator<br>EN: coordinator | KO: hash-bound selection, generated/unavailable lineage, draft choice/decision<br>EN: Hash-bound selection, generated/unavailable lineage, draft choice/decision | KO: composer 이전에만 clean-room 초안과 폴백을 결정하며 raw board를 넘기지 않습니다.<br>EN: Decides clean-room draft/fallback before composer and never passes raw board. | `omd ref select/check`; lineage record/check → composer |
| KO: composer<br>EN: composer | KO: `.omd/composition.md`의 정제된 composition contract<br>EN: Sanitised composition contract in `.omd/composition.md` | KO: upstream 이미지 프롬프트·초안 선택·원시 레퍼런스를 소유하지 않습니다.<br>EN: Does not own upstream image prompts, draft selection, or raw references. | `omd composition --check` → sketches/eye |
| KO: eye<br>EN: eye | KO: 익명 렌더의 블라인드 선택/비평<br>EN: Blind selection/critique of anonymous renders | KO: builder 이유나 원시 출처를 보지 않습니다.<br>EN: Does not see builder rationale or raw sources. | Render/probe evidence → hand repair or acceptance |
| KO: hand<br>EN: hand | KO: 프로덕션 구현, usage ledger, 실제 렌더·프로브 근거<br>EN: Production implementation, usage ledger, real render/probe evidence | KO: 한 선택 assembly만 구현하며 원시 캡처를 받지 않습니다.<br>EN: Implements one selected assembly and never receives raw captures. | `validateReferenceUsage` → finalizer |
| KO: finalizer<br>EN: finalizer | KO: `.omd/reference-report.md`와 정확한 최종 채팅 표<br>EN: `.omd/reference-report.md` and exact final chat table | KO: 새 에이전트/서비스가 아니라 coordinator의 finalization 책임입니다.<br>EN: Not a new agent/service; it is the coordinator’s finalisation responsibility. | `generateReferenceReport` → final response |

## Browser platform and recovery matrix / 브라우저 플랫폼·복구 매트릭스

| Environment / 환경 | State / 상태 | Action / 조치 |
| --- | --- | --- |
| KO: Darwin arm64<br>EN: Darwin arm64 | KO: 지원됨, SHA-256 `9a5895fc2f07b1010226d30f081d678fa2edcc15dd6f24cdf10074cfe1573749`<br>EN: Supported, SHA-256 `9a5895fc2f07b1010226d30f081d678fa2edcc15dd6f24cdf10074cfe1573749` | KO: healthy면 browser-rs를 우선 사용합니다.<br>EN: Use browser-rs first when healthy. |
| KO: Linux x64<br>EN: Linux x64 | KO: 지원됨, SHA-256 `792ca76e5ce0423968763556e110900a3aa65737fc6227724914aa137e972589`<br>EN: Supported, SHA-256 `792ca76e5ce0423968763556e110900a3aa65737fc6227724914aa137e972589` | KO: healthy면 browser-rs를 우선 사용합니다.<br>EN: Use browser-rs first when healthy. |
| KO: 그 외 플랫폼<br>EN: Any other platform | KO: `unsupported`; 다운로드하지 않습니다.<br>EN: `unsupported`; no download occurs. | KO: Playwright 모듈과 Chromium이 모두 준비된 폴백만 healthy입니다.<br>EN: Only a ready Playwright module plus Chromium fallback is healthy. |
| KO: 지원 플랫폼의 missing/bad/unowned target<br>EN: Supported platform with missing/bad/unowned target | KO: `unhealthy`; 외부/무영수증 바이트는 OMD 소유로 주장하지 않습니다.<br>EN: `unhealthy`; OMD does not claim foreign or unreceipted bytes as owned. | KO: 외부 파일을 덮어쓰지 말고 OMD 소유 대상을 설치/복구하거나 의도한 `OMD_BROWSER_RS_BIN`을 설정한 뒤 doctor를 다시 실행합니다.<br>EN: Do not overwrite foreign bytes; install/repair an OMD-owned target or set intentional `OMD_BROWSER_RS_BIN`, then rerun doctor. |

The launcher resolution is `OMD_BROWSER_RS_BIN`, then `PATH`, then the receipt-owned managed
target `$HOME/.local/share/oh-my-design/browser-rs/v0.1.10/browser-rs`. It uses a temporary
headless profile and removes it on exit/signals. Uninstall removes only a matching OMD
receipt-and-digest pair.

KO: 런처 탐색 순서는 `OMD_BROWSER_RS_BIN`, `PATH`, receipt 소유 관리 대상입니다. 임시 headless
프로필은 종료/시그널 때 제거하며, uninstall은 일치하는 OMD receipt·digest 쌍만 제거합니다.<br>
EN: The launcher resolves `OMD_BROWSER_RS_BIN`, `PATH`, then the receipt-owned target; it cleans
the temporary headless profile, and uninstall removes only a matching OMD receipt/digest pair.

## Commands / 명령

### Source checkout / 소스 체크아웃

Use the proven TypeScript entrypoint from a source checkout:

소스 체크아웃에서는 검증된 TypeScript 진입점을 사용합니다.

```bash
node bin/omd-install.ts install
node bin/omd-install.ts doctor
node bin/omd-install.ts browser install
node bin/omd-install.ts browser doctor --json
node bin/omd-install.ts browser smoke --fixture test/fixtures/probe.html --out /tmp/omd-browser-rs-smoke.png
node bin/omd-install.ts browser uninstall
node bin/omd.ts doctor
```

KO: 이 명령들은 호스트 설정을 변경하거나 다운로드할 수 있습니다. 최종 검증에서는 패키지 재설치와 Codex/Claude host doctor, project doctor, browser doctor 및 라이브 smoke를 성공적으로 실행했습니다.<br>
EN: These commands can change host configuration or download bytes. Final verification successfully ran package reinstall plus Codex/Claude host doctors, project doctor, browser doctor, and live smoke.

### Global package after installation / 설치 후 전역 패키지

After installing `@3xhaust/oh-my-design` globally, the equivalent post-install commands use the
public `oh-my-design` bin:

전역 `@3xhaust/oh-my-design` 설치 후에는 동일한 사후 운영 명령에 공개 `oh-my-design` bin을 사용합니다.

```bash
oh-my-design doctor
oh-my-design browser install
oh-my-design browser doctor --json
oh-my-design browser smoke --fixture /absolute/path/to/local-probe.html --out /tmp/omd-browser-rs-smoke.png
oh-my-design browser uninstall
```

`omd ref import-image`, `check`, `candidates`, and `select` are agent/internal operations behind
the conversation. Codex/Claude presents their candidate/final bilingual Markdown in chat; there
is no board UI or additional public bin.

KO: `omd ref import-image`, `check`, `candidates`, `select`는 대화 뒤의 에이전트 내부 작업입니다.
Codex/Claude가 후보/최종 한·영 Markdown을 채팅에 표시하며, 보드 UI나 추가 공개 bin은 없습니다.<br>
EN: The `omd ref` operations are internal behind chat; Codex/Claude displays the candidate/final
bilingual Markdown directly, with no board UI or extra public bin.

## Completion gates / 완료 게이트

| Gate / 게이트 | Current state / 현재 상태 | Evidence or next owner / 근거 또는 다음 담당 |
| --- | --- | --- |
| KO: 문서 링크·명령·diff 형식<br>EN: Documentation links, commands, and diff format | KO: 통과했습니다.<br>EN: Pass. | `README.md`; `README.ko.md`; `docs/lego-reference-audit.md`; `git diff --check` |
| KO: 안전 focused behavioural fixtures<br>EN: Safe focused behavioural fixtures | KO: 통과했습니다.<br>EN: Pass. | `test/ref-candidates-cli.test.ts`; `test/reference-report.test.ts`; `test/browser-rs-smoke.test.ts`; `.omd/evidence/lego-reference-browser-rs-final-qa.md` |
| KO: TypeScript typecheck<br>EN: TypeScript typecheck | KO: 최종 `npx tsc --noEmit`이 exit 0으로 통과했습니다.<br>EN: Final `npx tsc --noEmit` passed with exit 0. | `.omd/evidence/lego-reference-browser-rs/final-gate/final-gate-summary.md` |
| KO: 전체 `npm test`<br>EN: Full `npm test` | KO: 1,369개 중 1,368 pass, 0 fail, 0 cancelled, 1 expected platform skip으로 통과했습니다.<br>EN: Passed: 1,368 pass, 0 fail, 0 cancelled, 1 expected platform skip out of 1,369. | `test/`; `.omd/evidence/lego-reference-browser-rs/final-gate/final-gate-summary.md` |
| KO: `npm run build` 및 생성물 동기화<br>EN: `npm run build` and generated-output synchronization | KO: 최종 build가 exit 0으로 통과했고 source/generated parity를 확인했습니다.<br>EN: Final build passed with exit 0 and source/generated parity was checked. | `adapters/build.ts`; `dist/`; `.omd/evidence/lego-reference-browser-rs/final-gate/final-gate-summary.md` |
| KO: packed CLI/host 재설치·installed-surface smoke<br>EN: Packed CLI/host reinstall and installed-surface smoke | KO: OMD v0.16.1을 재설치하고 Codex·Claude host doctor와 project doctor가 모두 통과했습니다.<br>EN: OMD v0.16.1 was reinstalled; Codex/Claude host doctors and project doctor all passed. | `bin/omd-install.ts`; `.omd/evidence/lego-reference-browser-rs/task-15/task-15-manual-qa.md` |
| KO: 실제 browser-rs 공급자 smoke<br>EN: Live browser-rs provider smoke | KO: browser doctor와 navigate/type/click/snapshot/screenshot/close 라이브 smoke가 통과했습니다.<br>EN: Browser doctor and the live navigate/type/click/snapshot/screenshot/close smoke passed. | `adapters/browser-mcp.ts`; `test/browser-rs-smoke.test.ts`; `.omd/evidence/lego-reference-browser-rs-final-qa.md` |

KO: 따라서 이 감사는 채팅 우선 LEGO 레퍼런스 흐름, 최종 빌드·재설치·doctor·라이브 smoke 완료를 기록합니다. 이는 릴리스 또는 모든 외부 사이트 호환성 주장이 아닙니다.<br>
EN: This audit records completion of the chat-first LEGO reference flow and final build, reinstall, doctor, and live-smoke gates. It is not a release or a claim of compatibility with every external site.
