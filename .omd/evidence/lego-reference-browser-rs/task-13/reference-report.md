## 참조 사용 보고서

- 귀속 기록 결속: `3a2c9f30ea6e94dba8eefb66db9396b8e0f001afa14d811f4469794f8201de15`
- 클린룸 복합 계보: `generated`

| 상태 | 출처 사이트 / 페이지 | 원본 UI / 이미지 영역 | 배포 대상 | 차용한 속성 | 명시적으로 차용하지 않은 속성 | 변환 | 증거 경로 / 셀렉터 / 검증 |
|---|---|---|---|---|---|---|---|
| 사용됨 (used) | https∶／／ui.example/catalog | product card — ［data-card］ | /shop · ShopHero · ［data-omd="shop-hero"］ | vertical hierarchy | source copy | Rebuilt with local tokens. Selected-assembly rationale: Carry only hierarchy. Adaptation: Use local spacing. | src/shop.ts · ［data-omd="shop-hero"］ · Rendered hero independently. |
| 거절됨 (rejected) | https∶／／pinterest.example/pin/handmade-tiles | warm tile mosaic, top-right image fragment | /shop · ShopHero · ［data-omd="shop-hero"］ | — | source pixels and composition | Generated a local gradient. Selected-assembly rationale: Study colour density. Adaptation: Use generated local gradient. | src/shop.ts · ［data-omd="shop-hero"］ · No captured image bytes ship. |
| 반(反)참조 (anti-reference) | https∶／／ui.example/catalog | footer links — ［data-footer］ | /shop · ShopFooter · ［data-omd="shop-footer"］ | — | dense source grouping | Expanded local spacing. Selected-assembly rationale: Study link grouping. Adaptation: Use local content. | src/shop.ts · ［data-omd="shop-footer"］ · Footer grouping remains distinct. |

## Reference usage report

- Attribution record binding: `3a2c9f30ea6e94dba8eefb66db9396b8e0f001afa14d811f4469794f8201de15`
- Clean-room composite lineage: `generated`

| Status | Source site / page | Exact source UI / image region | Shipped target | Borrowed properties | Explicitly not borrowed | Transformation | Evidence path / selector / verification |
|---|---|---|---|---|---|---|---|
| used | https∶／／ui.example/catalog | product card — ［data-card］ | /shop · ShopHero · ［data-omd="shop-hero"］ | vertical hierarchy | source copy | Rebuilt with local tokens. Selected-assembly rationale: Carry only hierarchy. Adaptation: Use local spacing. | src/shop.ts · ［data-omd="shop-hero"］ · Rendered hero independently. |
| rejected | https∶／／pinterest.example/pin/handmade-tiles | warm tile mosaic, top-right image fragment | /shop · ShopHero · ［data-omd="shop-hero"］ | — | source pixels and composition | Generated a local gradient. Selected-assembly rationale: Study colour density. Adaptation: Use generated local gradient. | src/shop.ts · ［data-omd="shop-hero"］ · No captured image bytes ship. |
| anti-reference | https∶／／ui.example/catalog | footer links — ［data-footer］ | /shop · ShopFooter · ［data-omd="shop-footer"］ | — | dense source grouping | Expanded local spacing. Selected-assembly rationale: Study link grouping. Adaptation: Use local content. | src/shop.ts · ［data-omd="shop-footer"］ · Footer grouping remains distinct. |
