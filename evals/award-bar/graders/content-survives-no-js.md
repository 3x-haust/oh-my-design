# Grader: Motion Enhances Content, Never Gates It

Check that the page's content is readable with JavaScript disabled.

## Pass criteria

- `omd no-js <page>` exits 0: no `NOJS-CONTENT-LOSS`.
- Blocks that are below the fold and simply not yet scrolled to do not count — the check measures content that stays invisible *while in the viewport*.

## Fail criteria

- `NOJS-CONTENT-LOSS` fires: text is lost, or sizable blocks stay invisible once the reader reaches them. This is the signature of a reveal whose default state is `opacity: 0` with an IntersectionObserver as its only advance.

## Severity

FAIL — "content accessible with no JS" is a published developer-award accessibility criterion. A reveal that gates content fails it outright.
