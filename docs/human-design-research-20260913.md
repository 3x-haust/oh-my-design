# 사람처럼 디자인하는 AI: 조사와 하네스 반영

조사일: 2026-09-13. 수집 도구: Aside CLI의 공개 웹 검색과 브라우저 읽기.

최초 조사 범위는 사람 디자이너의 작업을 조사하고 OMD의 탐색·제작·검토 지침과 검증 코드를
개선하는 것이었다. 이후 사용자가 여섯 UI 예제 제작과 반복 평가를 요청했다. 아래 초기 조사와
검증 수치는 그 조사 변경에 한정되며, 후속 화면의 완성도를 나타내지 않는다.

## 채택한 방향

OMD의 모토는 **사람처럼 디자인하는 AI**다. 이를 실행 가능한 기준으로 풀면, 사람의 상황과
실제 콘텐츠에서 문제를 찾고, 대안을 만들어 보고, 관찰한 결과에 따라 판단을 바꾸는 것이다.
자료를 많이 모으거나 단계별 문서를 빠짐없이 만드는 것만으로 이 기준을 달성하지는 못한다.

조사에서는 기관의 방법론, 원래 디자인 인지 연구, 전문 디자이너 인터뷰, 실제 웹·타이포그래피
개편 사례, 사용성·접근성 지침을 함께 읽었다. 아래 14개 자료가 주요 근거다. 인터넷 전체를
망라한 체계적 문헌고찰은 아니며, 모든 디자이너가 하나의 방식으로 일한다는 주장도 아니다.
논문 PDF는 Aside가 확보한 공개 본문·추출문을 함께 사용했다. 출처별 연구 범위 밖의 추론을
OMD의 설계 선택과 구분했다.

## 출처와 적용 범위

| ID | 출처 | 확인한 내용과 위치 | 적용 한계 |
|---|---|---|---|
| S1 | Design Council, [The Double Diamond](https://www.designcouncil.org.uk/resources/the-double-diamond/) | Discover는 문제를 가정하는 대신 영향을 받는 사람을 이해하는 일이다. Define에서 문제를 달리 정의하고, Develop에서 다른 답을 탐색하고, Deliver에서 작은 규모로 시험한다. 현재 페이지는 이 그림을 디자인 사용 설명서가 아닌 참여의 초대로 설명한다. | 기관의 과정 설명이며 모든 프로젝트의 인과적 성공 공식은 아니다. |
| S2 | Carissa Carter, Stanford d.school, [Let’s Stop Talking About THE Design Process](https://dschool.stanford.edu/stories/lets-stop-talking-about-the-design-process) | “Our pedagogy has evolved”: 다섯 단계는 “just a first recipe”다. 모호함 다루기, 사람에게 배우기, 실험과 제작 능력을 상황에 맞게 조합한다. | 교육자의 논지다. 자동 경로 선택 정책의 성능을 검증한 연구는 아니다. |
| S3 | Rachel Krause, NN/g, [Tracking Research Questions, Assumptions, and Facts in Agile](https://www.nngroup.com/articles/tracking-questions-assumptions-facts-agile/) | “Creating a Knowledge Board”: 질문·가정·연구·사실을 구분한다. 증거가 없는 추정을 사실처럼 취급하지 않는다. | 실무 지침이며 보드 자체의 효과를 입증하는 통제 실험은 아니다. |
| S4 | Steven P. Dow 외, [Parallel Prototyping Leads to Better Design Results, More Divergence, and Increased Self-Efficacy](https://hci.stanford.edu/publications/2010/parallel-prototyping/ParallelPrototyping2010-submitted.pdf), [ACM](https://dl.acm.org/doi/10.1145/1879831.1879836) | Abstract/Results: 병렬 조건의 광고는 순차 조건보다 클릭률·전문가 평가·독립 다양성 평가에서 나은 결과를 보였다. 여러 안을 만든 다음 비교 피드백을 받는 조건이었다. | 짧은 배너 광고 과제와 비전문가 중심 표본이다. 모든 UI의 최적 시안 수나 AI의 효과를 확정하지 않는다. |
| S5 | Kees Dorst·Nigel Cross, [Creativity in the Design Process: Co-evolution of Problem-Solution](https://oro.open.ac.uk/3278/) | Section 3 및 문제·해결 공간의 공진화 논의: 숙련 산업 디자이너의 작업에서 문제 정의와 해결안을 함께 발전시키는 과정을 분석했다. | 제한된 프로토콜 연구다. 발견한 내용을 사용자 요구로 임의 추가할 권한은 제공하지 않는다. |
| S6 | Masaki Suwa·John S. Gero·Terry Purcell, [Unexpected Discoveries and S-Invention of Design Requirements](https://scispace.com/pdf/unexpected-discoveries-and-s-invention-of-design-2zsvj1gf5p.pdf) | Section 1 및 관찰 결과: 스케치를 외부화하고 다시 보면서 예상하지 못한 관계와 요구를 발견한다. 공개 사본의 원논문 본문을 근거로 사용했다. | 건축가 한 명의 짧은 박물관 설계 과제다. 제3자 공개 사본이며 UI 일반화에는 별도 검증이 필요하다. |
| S7 | Willemien Visser, [More or Less Following a Plan During Design: Opportunistic Deviations in Specification](https://inria.hal.science/inria-00633544/file/WVisser_IJMMS90.pdf) | Abstract 및 현장 관찰: 선언한 위계적 계획과 달리 실제 활동은 더 유용한 기회에 따라 조직되기도 했다. | 한 전문 엔지니어의 실제 명세 작업 관찰이다. 모든 의존성이나 검증 절차를 생략해도 된다는 근거는 아니다. |
| S8 | David G. Jansson·Steven M. Smith, [Design Fixation](https://ecologylab.net/research/publications/JanssonAndSmith1991.pdf) | 예시를 본 집단과 문제만 받은 집단의 실험: 예시의 특징과 일부 결함까지 후속 설계에 재현되는 고착을 관찰했다. | 짧은 공학 과제다. 레퍼런스를 전혀 보지 말라는 결론은 아니다. |
| S9 | Nathan Crilly, [Fixation and Creativity in Concept Development: The Attitudes and Practices of Expert Designers](https://www.repository.cam.ac.uk/items/f6ea38af-fca1-493f-ad14-3a0f95a069a8) | 전문 디자이너 인터뷰: 이전 경험, 고착을 자각하는 태도, 맥락, 과거 실패가 다음 탐색에 영향을 줄 수 있다. | 소규모 자기보고 연구다. 회고 기록만으로 고착 예방 효과를 확정하지 않는다. |
| S10 | Kathryn Whitenton·Sarah Gibbons, NN/g, [Case Study: Iterative Design and Prototype Testing of the NN/g Homepage](https://www.nngroup.com/articles/case-study-iterative-design-prototyping/) | “Iterative Prototype Testing”: 신규·재방문 사용자가 데스크톱·모바일에서 프로토타입을 시험했다. 카피·정보 구조·레이아웃·스타일의 피드백을 나누고 여러 안을 수정했다. 말로 표현한 선호와 행동이 다를 수 있었다. | 자사 홈페이지 개편 사례다. 단계 순서나 반복 횟수를 보편화하지 않는다. |
| S11 | Karri Saarinen, Airbnb Design, [Working Type: How We Introduced Airbnb Cereal to Our UI](https://medium.com/airbnb-design/working-type-81294544608b) | “Connecting Brand and UI” 및 제품 통합: 실제 사용을 모사한 콘텐츠와 화면, 플랫폼별 렌더, 스크린샷 점검으로 서체와 조판을 평가했다. | 큰 자원을 투입한 맞춤 서체 사례다. 반복 횟수·규모를 OMD 의무로 옮기거나 한국어 조판 규칙을 추론하지 않는다. |
| S12 | Government Digital Service, [Using Moderated Usability Testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing) | 실제·잠재 사용자가 구체적 과제를 수행하는 모습을 관찰한다. 연구 질문으로 과제를 정하며 과제 문구가 답이나 탐색 경로를 알려주지 않게 한다. | 실제 참여자가 필요한 방법이다. 브라우저 자동화나 AI 페르소나는 참여자를 대체한 증거가 아니다. |
| S13 | Government Digital Service, [Writing for User Interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces) | UI 사용법을 설명하는 문구가 필요하다면 인터페이스 문제를 살핀다. 색·위치만으로 지시하지 않고, 링크를 따로 읽어도 목적을 알 수 있게 한다. | GOV.UK 서비스의 문체가 모든 브랜드나 문화권의 문체는 아니다. |
| S14 | Government Digital Service, [Making Your Service Accessible: An Introduction](https://www.gov.uk/service-manual/helping-people-to-use-your-service/making-your-service-accessible-an-introduction) | 자동·수동 검사, 보조기술, 장애가 있는 사용자 연구를 함께 다룬다. 기능이 바뀌면 접근성을 다시 확인한다. | 영국 공공서비스의 법적 기준을 다른 시장의 법적 의무로 옮기지 않는다. 검사 통과와 전체 과업의 사용성은 다르다. |

## 근거에서 OMD의 행동으로

| 판단 문제 | 근거 | OMD가 하는 일 | 기존 경계 |
|---|---|---|---|
| 지금 무엇을 알아야 하는가 | S1–S3, S7 | 과업·실패 비용·주요 구성에 영향을 줄 질문을 고르고, 예상 관찰과 반증 조건을 시험 전에 적는다. | 이미 있는 route, frame, decision graph를 사용한다. 새 의무 단계나 조사량을 만들지 않는다. |
| 사람의 필요를 실제로 아는가 | S1, S3, S12 | 제공된 사실, 참여자 관찰, 외부 연구, 가설을 분리한다. | 인터뷰·인용·사용자 선호를 생성하지 않는다. 미검증 가설은 userFacts로 승격하지 않는다. |
| 다른 해법을 충분히 보았는가 | S4, S8 | 선택된 탐색에서 콘텐츠와 형태의 관계가 다른 안을 독립적으로 만든다. | 기존 시안 수 결정과 source-free 전달·블라인드 리뷰를 보존한다. |
| 만들어 보니 무엇이 달라졌는가 | S5, S6, S10 | 관찰에 따라 수정·유지·문제 재정의를 선택한다. | 유지 기록은 최종 승인이 아니다. 재정의는 상위 소유자에게 돌아가며, 실제 수정은 다시 렌더하고 검증한다. |
| 화면과 문장이 실제로 작동하는가 | S10–S14 | 실제 콘텐츠·상태·뷰포트에서 조판, 과업, 문구, 접근성을 각각 확인한다. | 자동 검사·AI 평가·실제 사용자 증거를 서로 대체하지 않는다. |
| 이번 경험을 다음에 써도 되는가 | S8, S9 | 맥락·대안·결과·반례가 있는 교훈을 지원되는 범위 안에서 재사용한다. | 기존 validated-learning 계약을 사용하며 한 번의 성공이나 실패를 보편 규칙으로 만들지 않는다. |

위 표의 OMD 행동은 자료를 바탕으로 선택한 **하네스 설계**다. 해당 연구가 OMD 자체를
평가하거나 이 구현의 품질 향상을 입증한 것은 아니다.

## 구현

- [design-practice.md](../core/protocol/design-practice.md)에 출처 식별자를 제거한 실행 계약을 두었다.
  조율자는 경로 선택 전에 읽고, Framer·Composer·Hand는 맡은 절만 읽는다. 블라인드 Eye에게
  조사 자료나 제작 의도를 추가 전달하지 않는다.
- [craft/index.ts](../core/craft/index.ts)는 명시적 `revise`, `retain`, `reframe`을 기록한다.
  관찰·기준·이유와 실제 프로젝트 PNG가 필요하며 PNG 바이트의 SHA-256을 저장한다.
  `revise`에는 구체적 변경이 필요하고 나머지 판단에는 변경을 꾸며 넣을 수 없다.
  기존 변경 전용 기록은 계속 읽을 수 있다.
- 역할 원본, 적응형 체크포인트 정책, 프로토콜, 한국어·영어 README를 맞추고 생성본은
  `npm run build`로 갱신한다. 모델 선택과 역할별 권한은 변경하지 않는다.

## 채택하지 않은 권고와 남은 한계

Aside 조사 메모의 자체 제안 중 “항상 3–5개 분기”는 채택하지 않았다. 원래 연구의 과제와
표본으로 범용 최적 개수를 정할 수 없다. 매 렌더마다 새 검토 단계나 사용자 연구를 의무화하는
제안도 현재의 조건부 경로와 다르므로 가져오지 않았다. 사용자에게 근거가 없는 제품 능력이나
새 요구사항을 추가할 권한 역시 만들지 않았다.

`hypothesis-validation`은 이번에 역할이 수행할 절차를 갖추었지만, 가설마다 예상·반증·결과를
묶어 판정하는 별도 기계 검증기는 아직 없다. 기록 형식이 맞는 것과 가설이 검증된 것은
다르다. 고위험 trade-off와 선택된 visual-observation의 기존 실패·전후 증거 요구도 그대로다.
유지 가능한 craft 기록을 그 증거 대신 제출할 수 없으며, 필요한 증거가 없다면 해당 계약은
미완료다. 후속 변경은 기존 계보와 독립 평가 경계를 보존하는 별도 계약 설계가 필요하다.

토론 결론과 채택안의 일치 검사도 검토했으나 이번 변경에는 넣지 않았다. 기존 검사기가
보존된 모든 토론을 현재 decision graph와 비교하므로, 단순 일치 요구는 정당한 재검토와
방향 전환까지 차단한다. 먼저 현재 결정에 적용되는 토론 버전을 명시하는 계약이 필요하다.
과거 토론의 삭제나 결과 덮어쓰기로 이 문제를 우회하지 않는다.

PNG 해시는 증거의 정체성을 남길 뿐 관찰 내용의 진실성이나 판단의 적절성을 판정하지 않는다.
이번 회귀 테스트의 합성 PNG도 형식·보존·거부 동작을 검증하는 입력이다. 사람 수준의 미감이나
사용성을 평가한 자료가 아니다. 독립적인 사용자 과업과 블라인드 사람 평가 없이 테스트 수,
AI 간 동의, 문서 준수를 디자인 품질 점수로 보고하지 않는다.

## 검증 결과

유지 판단의 정상 기록, 기준·이유 누락과 없는/잘못된 이미지 거부, 수정 없는 `revise` 거부,
변경을 주장하는 `retain` 거부, 재정의의 비승인 성격, 과거 기록 호환성, CLI 왕복을 확인했다.
실제 390×844 브라우저 렌더를 보고 유지 판단을 기록한 뒤 원본 HTML 불변과 PNG 해시 일치도
확인했다. Codex·Claude의 생성된 패키지가 같은 실행 계약을 포함한다.

최종 `npm test`는 2,568개 중 **2,566 통과, 실패 0, 건너뜀 2**였다. `npx tsc --noEmit`,
`npm run build`, `git diff --check`도 통과했다. 앞선 전체 검사에서 나온 경로 스냅샷과
문서 참조 검사 문제를 수정한 뒤 소스를 고정해 전체 검사를 다시 수행한 결과다.
선행 미커밋 변경을 보존했으며 저장소 커밋·PR·릴리스는 만들지 않았다.

## 사용자 공유 자료에서 원본 레퍼런스로

후속 평가에서 사용자는 [Threads 글](https://www.threads.com/share/_1imZkHc3/)을 참고해
레퍼런스를 찾도록 요청했다. 공개 캡처에서 읽은 글은 Supahero, Navbar Gallery, Footer Design을
소개하는 자료 모음이었다. 특정 앱이나 그림체를 채택하라는 요청으로 해석하지 않았다.
실제 조사에서는 Supahero의 mymind 항목을 통해 [원본 사이트](https://mymind.com/)까지 확인했다.
내부 제품 화면은 삽입된 데모 영상이므로, 보이는 이미지·레이블의 관계만 관찰했다. 앱 내부 DOM과
실제 완료·추가 동작을 확인했다는 주장은 하지 않는다.

재사용할 절차는 [공유 글과 컴포넌트 디렉터리 계약](../core/protocol/reference-assembly.md#user-shared-posts-and-component-directories)에
두고 Scout 원본에서 참조한다. 사용자 지정 Aside 검색, 글→디렉터리 항목→원본의 출처 연결,
현재 결정에 맞는 컴포넌트 선택, 정지 이미지·영상·실제 인터랙션의 근거 구분을 포함한다.
이 자료가 잔잔의 미감을 검증한 것은 아니다. 사용자의 후속 선택은 **“담백하지만 개성 있는 제품 앱”**이며,
상대적으로 좋다고 평가한 일러스트 방향과 숙련된 디테일을 요구한 비판을 함께 유지한다.
