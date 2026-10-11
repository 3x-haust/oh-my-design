/** Keep tsx's injected __name helper in scope when Playwright executes callbacks in the page. */
export function browserCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const source = Function.prototype.toString.call(callback);
  const wrapped = (...args: Args): Result => callback(...args);
  Object.defineProperty(wrapped, 'toString', {
    value: () => `function(...args) { const __name = (callback) => callback; return (${source})(...args); }`,
  });
  return wrapped;
}

export const browserExpression = (source: string): string => browserEvaluationExpression(source);

/** Serialize argument data; only the supplied page function is executable source. */
export function browserEvaluationExpression(source: string, args: readonly unknown[] = []): string {
  const argumentsSource = args.map(value => value === undefined ? 'undefined' : JSON.stringify(value)).join(',');
  return `(() => { const __name = (callback) => callback; return (${source})(${argumentsSource}); })()`;
}
