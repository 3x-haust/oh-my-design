export function negatesMarketScope(value: string, tokens: readonly string[]): boolean {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('und');
  return tokens.some(candidate => {
    const token = candidate.normalize('NFKC').toLocaleLowerCase('und');
    let index = normalized.indexOf(token);
    while (index >= 0) {
      const before = normalized.slice(Math.max(0, index - 64), index);
      const after = normalized.slice(index + token.length, index + token.length + 64);
      const negatedBefore = /(?:is\s+not|isn't|not)\s+available\s+in\s*$|(?:does\s+not|doesn't)\s+(?:serve|support|operate\s+in)\s*$|not\s+(?:serving|supporting)\s*$|(?:unavailable|unsupported)\s+in\s*$|(?:outside|excludes?|excluding)\s*$/u.test(before)
        || /(?:미지원|제외|불가|지원하지\s*않|제공하지\s*않)(?:는|인)?\s*$/u.test(before);
      const negatedAfter = /^\s*(?:은|는|이|가|을|를)?\s*(?:외|미지원|제외|불가|지원하지\s*않|제공하지\s*않)/u.test(after)
        || /^\s*(?:(?:is|are|was|were)\s+)?(?:not\s+available|unavailable|unsupported|not\s+supported|excluded)\b/u.test(after)
        || /^.{0,32}\b(?:service|product|platform)\s+(?:(?:is|are|was|were)\s+)?(?:not\s+available|unavailable|unsupported|not\s+supported|excluded)\b/u.test(after);
      if (negatedBefore || negatedAfter) return true;
      index = normalized.indexOf(token, index + token.length);
    }
    return false;
  });
}
