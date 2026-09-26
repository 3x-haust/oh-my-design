const resumeRequest = /^(?:please\s+)?(?:continue|resume|keep going|계속\s*(?:해|해줘|해주세요|진행해|진행해줘|진행해주세요)|이어서\s*(?:해|해줘|진행해))[.!。]?$/iu;
const buildObject = String.raw`(?:the\s+)?(?:OMD\s+)?(?:build|implementation|repair)(?:\s+(?:workflow|task|work))?`;
const explicitBuildResume = new RegExp(String.raw`^(?:(?:please\s+)?(?:continue|resume)\s+${buildObject}|(?:OMD\s*)?(?:구현|개발|빌드|수정|복구)(?:\s*(?:작업|을))?\s*(?:계속|이어서)\s*(?:해|해줘|해주세요|진행해|진행해줘|진행해주세요))[.!。]?$`, 'iu');
const cancellation = new RegExp(String.raw`^(?:(?:please\s+)?(?:stop|cancel|pause)(?:\s+(?:${buildObject}|(?:the\s+)?(?:OMD\s+)?(?:work|task|workflow|discovery|research)))?(?:\s+please)?|(?:OMD\s*)?(?:(?:작업|구현|개발|빌드|수정|복구|조사|수집)(?:\s*작업)?(?:을|를)?\s*)?(?:멈춰|중단해|취소해|그만해)(?:\s*(?:줘|주세요))?)[.!。]?$`, 'iu');

export class WorkflowResume {
  private readonly routes = new Map<string, string>();
  clear(): void { this.routes.clear(); }
  remember(cwd: string, routeSha256: string): void {
    if (/^[a-f0-9]{64}$/u.test(routeSha256)) this.routes.set(cwd, routeSha256);
  }
  accepts(work: Readonly<{ cwd: string; routeSha256: string; prompt: string }>): boolean {
    const prompt = work.prompt.trim();
    if (cancellation.test(prompt)) { this.routes.delete(work.cwd); return false; }
    if (!/^[a-f0-9]{64}$/u.test(work.routeSha256)) return false;
    const previous = this.routes.get(work.cwd);
    if (previous !== undefined && previous !== work.routeSha256) this.routes.delete(work.cwd);
    if (explicitBuildResume.test(prompt)) { this.routes.set(work.cwd, work.routeSha256); return true; }
    return previous === work.routeSha256 && resumeRequest.test(prompt);
  }
}
