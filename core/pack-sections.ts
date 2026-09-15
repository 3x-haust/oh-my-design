type Heading = Readonly<{ title: string; level: number; offset: number }>;

export class PackSectionError extends Error {
  readonly section: string;
  readonly available: readonly string[];

  constructor(section: string, available: readonly string[], ambiguous: boolean) {
    super(`pack section ${ambiguous ? 'is ambiguous' : 'not found'}: ${section}`);
    this.section = section;
    this.available = available;
  }
}

/** Resolve actual Markdown sections, retaining descendants but never sibling sections or fences. */
export function extractPackSections(body: string, requested: readonly string[]): string {
  const headings: Heading[] = [];
  let offset = 0;
  let fence: { marker: string; length: number } | undefined;
  for (const line of body.split(/(?<=\n)/)) {
    const content = line.replace(/[\r\n]+$/, '');
    const fenced = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (fence !== undefined) {
      if (fenced?.[1]?.[0] === fence.marker && fenced[1].length >= fence.length && fenced[2]!.trim() === '') fence = undefined;
    } else if (fenced !== null) {
      fence = { marker: fenced[1]![0]!, length: fenced[1]!.length };
    } else {
      const match = /^ {0,3}(#{1,6})[\t ]+(.+?)(?:[\t ]+#+)?[\t ]*$/.exec(content);
      if (match !== null) headings.push({ title: match[2]!, level: match[1]!.length, offset });
    }
    offset += line.length;
  }
  const available = headings.filter(({ level }) => level >= 2).map(({ title, level }) => `${'#'.repeat(level)} ${title}`);
  return requested.map((section) => {
    const matches = headings.filter(({ title, level }) => level >= 2 && title.toLowerCase() === section.trim().toLowerCase());
    if (matches.length !== 1) throw new PackSectionError(section, available, matches.length > 1);
    const selected = matches[0]!;
    const next = headings.find(({ level, offset }) => offset > selected.offset && level <= selected.level);
    return body.slice(selected.offset, next?.offset);
  }).join('\n');
}
