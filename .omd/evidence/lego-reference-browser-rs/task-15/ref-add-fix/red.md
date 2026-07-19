# RED — packed installed reference capture

Command shape: pack the working tree with `npm pack --ignore-scripts`, install that tarball into a fresh consumer using `npm install --offline --ignore-scripts`, then run the installed `omd ref add` against `fixture.html` with `--selector .card --no-energy`.

Observed output:

```text
page.evaluate: ReferenceError: __name is not defined
    at extractInPage (eval at evaluate (:303:30), <anonymous>:1:56)
    at eval (eval at evaluate (:303:30), <anonymous>:1:8244)
    at eval (<anonymous>)
    at UtilityScript.evaluate (<anonymous>:303:30)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
status=1
```

Control: the source launcher with the same fixture, selector, and `--no-energy` exited `0`; the installed callback string contained only the `__name` helper (`{"containsNameHelper":true,"helpers":["__name"]}`).

Focused test RED before implementation:

```text
SyntaxError: The requested module '../core/render/index.ts' does not provide an export named 'BrowserEvaluationSerializationError'
```
