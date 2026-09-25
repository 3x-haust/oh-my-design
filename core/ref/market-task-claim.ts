function pageText(taskText: string): string {
  return taskText.split('\n').filter(line => !/^\s*(?:related links?|further reading|see also|관련 링크|관련 서비스)\s*[:：]/iu.test(line))
    .join(' ').slice(0, 1200).toLocaleLowerCase('und').replace(/\s+/gu, ' ');
}

function deniesTask(claim: string, task: RegExp, verb: RegExp, korean: RegExp): boolean {
  return claim.split(/[.!?。！？]/u).some(sentence => {
    const otherAudience = /\b(?:for|to)\s+(?:non[- ]?residents?|visitors?|tourists?)\b|비거주자|방문객/iu.test(sentence);
    const targetAudience = /\b(?:residents?|citizens?|users?)\b|주민|거주자/iu.test(sentence);
    if (otherAudience && !targetAudience) return false;
    return task.test(sentence) && (verb.test(sentence) || korean.test(sentence));
  });
}

export function selfRootTaskClaim(taskCategory: string, taskText: string): boolean {
  const claim = pageText(taskText);
  if (/welfare|benefits?|복지|혜택/iu.test(taskCategory)) {
    const denied = deniesTask(claim, /\b(?:welfare|benefits?)\b|복지|혜택/iu,
      /\b(?:no|without)\s+(?:\w+\s+){0,2}(?:welfare|benefits?)\b|\b(?:do(?:es)?\s+not|don['’]t|doesn['’]t)\s+(?:\w+\s+){0,2}(?:offer|provide|support|include)\s+(?:\w+\s+){0,2}(?:welfare|benefits?)\b|\b(?:welfare|benefits?)\b.{0,40}\b(?:not offered|not available|not provided|unavailable)\b/iu,
      /(?:복지|혜택).{0,16}(?:없|미제공|제공하지)/iu);
    return !denied && /\b(?:welfare|benefits?)\b(?:\s+\w+){0,1}\s+\b(?:service|program|portal|directory|application|support|finder|checker)\b|\b(?:service|program|portal|directory|application|support)\b.{0,18}\b(?:welfare|benefits?)\b|(?:복지|혜택|지원).{0,12}(?:서비스|신청|정책|포털|안내|찾기|검색)/iu.test(claim);
  }
  if (/flight|airline|항공|비행/iu.test(taskCategory) && /booking|reservation|ticket|예약|예매/iu.test(taskCategory)) {
    const denied = deniesTask(claim, /\b(?:flight|airline)\b|항공|비행/iu,
      /\b(?:no|without)\s+(?:flight|airline)\s+(?:booking|reservation|tickets?)\b|\b(?:do(?:es)?\s+not|don['’]t|doesn['’]t)\s+(?:\w+\s+){0,2}(?:offer|provide|support)\s+(?:flight|airline)\s+(?:booking|reservation|tickets?)\b|\b(?:flight|airline)\b.{0,25}\b(?:booking|reservation|tickets?)\b.{0,30}\b(?:unavailable|not offered|not provided)\b/iu,
      /(?:항공|비행).{0,12}(?:예약|예매).{0,12}(?:불가|미지원|제공하지)/iu);
    return !denied && /\b(?:flight|airline)\b.{0,20}\b(?:booking|reservation|ticket)\b|\b(?:book|reserve)\b.{0,12}\b(?:flight|airline)\b|(?:항공|비행).{0,12}(?:예약|예매)/iu.test(claim);
  }
  const terms = (taskCategory.toLocaleLowerCase('und').match(/[가-힣]{2,}|[a-z]{4,}/gu) ?? [])
    .filter(term => !/^(?:public|global|local|service|services|product|platform|application|website|design)$/u.test(term));
  return terms.length > 0 && terms.every(term => /[가-힣]/u.test(term) ? claim.includes(term)
    : new RegExp('\\b' + term + '\\b', 'u').test(claim));
}
