/** Keep tsx's injected __name helper in scope when Playwright executes callbacks in the page. */
export function browserCallback<Result>(callback: (...args: any[]) => Result): (...args: any[]) => Result {
  // Construct outside tsx: Playwright serializes this function, not the tsx-transformed callback.
  return new Function(`return function(...args) { const __name = (callback) => callback; return (${callback.toString()})(...args); }`)() as (...args: any[]) => Result;
}

export const browserExpression = (source: string): string => browserEvaluationExpression(source, '');

/** For existing string-based page expressions with explicitly encoded arguments. */
export function browserEvaluationExpression(source: string, argumentExpression: string): string {
  return `(() => { const __name = (callback) => callback; return (${source})(${argumentExpression}); })()`;
}
