export function closestNames(input: string, names: readonly string[], count = 3): readonly string[] {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = old;
      }
    }
    return row[b.length]!;
  };
  return [...new Set(names)].map(name => ({ name, cost: distance(input, name) }))
    .filter(item => item.cost <= Math.max(2, Math.ceil(input.length / 3)))
    .sort((a, b) => a.cost - b.cost || (a.name < b.name ? -1 : 1)).slice(0, count).map(item => item.name);
}
