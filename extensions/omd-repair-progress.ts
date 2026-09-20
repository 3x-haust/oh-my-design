const VALIDATED_STAGES = new Set(['domain', 'frame', 'reference-board', 'copy', 'composition']);
type Credit = { route: string; seen: Set<string> };

export class RepairProgress {
  private readonly projects = new Map<string, Credit>();
  clear(): void { this.projects.clear(); }
  delete(cwd: string): void { this.projects.delete(cwd); }
  observe(cwd: string, value: unknown): boolean {
    if (!value || typeof value !== 'object' || !('routeSha256' in value) || !('validatedStages' in value)
      || typeof value.routeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.routeSha256)
      || !Array.isArray(value.validatedStages)
      || !value.validatedStages.every((s: unknown) => typeof s === 'string' && VALIDATED_STAGES.has(s))) return false;
    let credit = this.projects.get(cwd);
    if (!credit) {
      this.projects.set(cwd, { route: value.routeSha256, seen: new Set(value.validatedStages) });
      return true;
    }
    if (credit.route !== value.routeSha256) return false;
    let earned = false;
    for (const stage of value.validatedStages) {
      if (!credit.seen.has(stage)) { credit.seen.add(stage); earned = true; }
    }
    return earned;
  }
}
