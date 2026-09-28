const MAX_STAGNANT_PASSES = 2;
type LoopState = { scope: string; seen: Set<string>; stagnant: number; passes: number; materialSeen: Set<string> };
export type RepairDecision = Readonly<{ retry: boolean; pass: number; stalled: boolean }>;

export class RepairLoop {
  private readonly projects = new Map<string, Map<string, LoopState>>();
  clear(): void { this.projects.clear(); }
  delete(cwd: string): void { this.projects.delete(cwd); }
  next(cwd: string, lane: string, scope: string, marker: unknown, revision: number, material?: readonly string[]): RepairDecision {
    let lanes = this.projects.get(cwd);
    if (!lanes) { lanes = new Map(); this.projects.set(cwd, lanes); }
    const token = JSON.stringify({ marker, revision });
    let state = lanes.get(lane);
    if (!state) {
      state = { scope, seen: new Set([token]), stagnant: 0, passes: 1, materialSeen: new Set(material ?? []) };
      lanes.set(lane, state);
      return { retry: true, pass: state.passes, stalled: false };
    }
    if (state.scope !== scope) return { retry: false, pass: state.passes, stalled: true };
    if (material !== undefined) {
      const newIdentities = material.filter(identity => !state.materialSeen.has(identity));
      for (const identity of newIdentities) state.materialSeen.add(identity);
      state.stagnant = newIdentities.length ? 0 : state.stagnant + 1;
      if (state.stagnant > MAX_STAGNANT_PASSES) return { retry: false, pass: state.passes, stalled: true };
      state.passes++;
      return { retry: true, pass: state.passes, stalled: false };
    }
    if (!state.seen.has(token)) {
      state.seen.add(token);
      state.stagnant = 0;
      state.passes++;
      return { retry: true, pass: state.passes, stalled: false };
    }
    state.stagnant++;
    if (state.stagnant <= MAX_STAGNANT_PASSES) {
      state.passes++;
      return { retry: true, pass: state.passes, stalled: false };
    }
    return { retry: false, pass: state.passes, stalled: true };
  }
}
