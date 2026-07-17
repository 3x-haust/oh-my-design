# Reference synthesis — 팀 문서 검색 서비스 (development task)

사내 문서 검색 서비스의 웹앱을 만들어줘. 검색창에서 문서를 찾고, 결과를 폴더·작성자·기간으로
거르고, 문서를 열어 읽고, 자주 쓰는 문서를 모아두는 서비스야.

레퍼런스를 세 개 줄게. 분위기만 비슷하게 하지 말고, 각각에서 뭘 가져왔는지 알 수 있게 해줘:

- https://linear.app — 이 제품의 내비게이션 구조와 밀도가 좋아.
- https://www.notion.so — 문서를 읽는 화면의 타이포그래피와 여백이 좋아.
- https://duckduckgo.com — 검색 결과 화면의 단순함과 필터 동선이 좋아.

## Grading hooks

- `.omd/refs/`에 세 레퍼런스가 `origin: user`로 기록되고 단위별 principles가 남아야 한다.
- `.omd/composition.md`의 Reference synthesis 섹션에 세 레퍼런스 각각의 trait → 적용 위치
  → 변형 → 충돌 해결이 있어야 한다 (`omd composition --check`가 강제).
- 최종 화면에서 세 trait가 눈으로 확인되고, `omd ref distance`가 어떤 단일 레퍼런스에도
  0.6을 넘지 않아야 한다.
- graders/synthesis-map.md로 채점한다.
