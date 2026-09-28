import { isVerifiedJudgment, type VerifiedJudgment } from '../core/judgment/index.ts';

export const isWorkflowResumePrompt = (_prompt: string, judgment?: VerifiedJudgment): boolean => isVerifiedJudgment(judgment) && judgment.judgment.purpose === 'workflow-continuation'
  && judgment.judgment.decision === 'resume';

export class WorkflowResume {
  private readonly routes = new Map<string, string>();
  clear(): void { this.routes.clear(); }
  remember(cwd: string, routeSha256: string): void {
    if (/^[a-f0-9]{64}$/u.test(routeSha256)) this.routes.set(cwd, routeSha256);
  }
  /** The Pi host calls this only after CLI signature/source verification and exact captured-turn matching. */
  acceptCheckedTurn(cwd: string, routeSha256: string, decision: string): boolean {
    if (!/^[a-f0-9]{64}$/u.test(routeSha256)) return false;
    const previous = this.routes.get(cwd);
    if (previous !== undefined && previous !== routeSha256) { this.routes.delete(cwd); return false; }
    if (decision === 'cancel' || decision === 'pause') { this.routes.delete(cwd); return false; }
    if (decision !== 'resume') return false;
    this.routes.set(cwd, routeSha256);
    return true;
  }
  accepts(work: Readonly<{ cwd: string; routeSha256: string; prompt: string; judgment?: VerifiedJudgment }>): boolean {
    if (!/^[a-f0-9]{64}$/u.test(work.routeSha256)) return false;
    const previous = this.routes.get(work.cwd);
    if (previous !== undefined && previous !== work.routeSha256) this.routes.delete(work.cwd);
    const judgment = work.judgment;
    if (!isVerifiedJudgment(judgment) || judgment.judgment.purpose !== 'workflow-continuation' || !judgment.sources.some(source => source.text === work.prompt)) return false;
    if (judgment.judgment.decision === 'cancel' || judgment.judgment.decision === 'pause') {
      this.routes.delete(work.cwd); return false;
    }
    if (judgment.judgment.decision !== 'resume') return false;
    this.routes.set(work.cwd, work.routeSha256);
    return true;
  }
}
