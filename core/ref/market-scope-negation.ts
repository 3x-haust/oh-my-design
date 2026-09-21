export function negatesMarketScope(value: string, tokens: readonly string[]): boolean {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('und');
  return tokens.some(candidate => {
    const token = candidate.normalize('NFKC').toLocaleLowerCase('und');
    let index = normalized.indexOf(token);
    while (index >= 0) {
      const tokenBefore = normalized.slice(0, index).at(-1);
      const tokenAfter = normalized.slice(index + token.length).at(0);
      if ((tokenBefore !== undefined && /[\p{L}\p{N}]/u.test(tokenBefore))
        || (tokenAfter !== undefined && /[\p{L}\p{N}]/u.test(tokenAfter)
          && !/^[\p{Script=Hangul}\p{Script=Han}]+$/u.test(token))) {
        index = normalized.indexOf(token, index + token.length); continue;
      }
      const before = normalized.slice(Math.max(0, index - 96), index);
      const after = normalized.slice(index + token.length, index + token.length + 96);
      const positiveBefore = /no\s+service\s+is\s+available\s+outside\s*$|not\s+unavailable\s+in\s*$|outside\s*$/u.test(before);
      const positiveAfter = /^\s*(?:is|was)\s+excluded\s+from\s+(?:the\s+)?unsupported\s+list\b/u.test(after);
      const negatedBefore = /(?:is\s+not|isn't|not|no\s+longer)\s+available\s+in\s*$|no\s+(?:services?|products?|platforms?)\s+(?:(?:are|were)\s+)?(?:available|offered)\s+in\s*$|(?:does\s+not|doesn't)\s+(?:serve|support|operate)(?:\s+[\p{L}\p{N}-]+){0,4}\s+in\s*$|not\s+(?:serving|supporting|operating)\s*$|unavailable\s+to(?:\s+[\p{L}\p{N}-]+){0,4}\s+(?:in|of)\s*$|(?:unsupported|unavailable)\s+in\s*$|(?:excludes?|excluding)\s*$/u.test(before)
        || /(?:미지원|제외|불가|지원하지\s*않|제공하지\s*않)(?:는|인)?\s*$/u.test(before);
      const negatedAfter = /^\s*(?:은|는|이|가|을|를|에서는|거주자는)?.{0,32}(?:이용할\s*수\s*없|지원\s*대상이\s*(?:아니|아닙)|미지원|제외|불가|지원하지\s*않|제공하지\s*않)/u.test(after)
        || /^\s*(?:residents?|users?)?\s*(?:(?:is|are|was|were)\s+)?(?:not\s+served|not\s+supported|not\s+available|not\s+eligible|not\s+offered|ineligible|unavailable|unsupported|excluded|outside\s+(?:our\s+)?coverage)\b/u.test(after)
        || /^.{0,32}\b(?:service|product|platform)\s+(?:(?:is|are|was|were)\s+)?(?:not\s+available|not\s+offered|unavailable|unsupported|not\s+supported|excluded)\b/u.test(after);
      if (!positiveBefore && !positiveAfter && (negatedBefore || negatedAfter)) return true;
      index = normalized.indexOf(token, index + token.length);
    }
    return false;
  });
}
