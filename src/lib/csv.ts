export type CsvSchoolRow = { name: string; short_name: string; city?: string; line: number };

/** Parse CSV with quoted fields that may contain commas. */
export function parseSchoolCsv(text: string): { rows: CsvSchoolRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: CsvSchoolRow[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.some((l) => l.trim())) return { rows, errors: ['File is empty.'] };

  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out.map((p) => p.replace(/^"|"$/g, ''));
  };

  let start = 0;
  const header = split(lines[0]).map((h) => h.toLowerCase());
  if (header.some((h) => h.includes('name'))) start = 1;

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const parts = split(lines[i]);
    const name = parts[0]?.trim();
    if (!name) {
      errors.push(`Line ${i + 1}: missing school name.`);
      continue;
    }
    const short_name = (parts[1] || name).trim().slice(0, 48);
    const city = parts[2]?.trim() || undefined;
    rows.push({ name, short_name, city, line: i + 1 });
  }

  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) errors.push(`Duplicate school name "${row.name}" (lines ${seen.get(key)} and ${row.line}).`);
    else seen.set(key, row.line);
  }

  return { rows, errors };
}

export function planStageMath(incomingTeams: number, groupSize: number, qualifyPerGroup: number) {
  const groupsNeeded = Math.ceil(incomingTeams / groupSize);
  const leftover = incomingTeams % groupSize;
  const advancing = groupsNeeded * qualifyPerGroup;
  const valid = leftover === 0 && qualifyPerGroup < groupSize && incomingTeams > 0;
  let message = `${groupsNeeded} groups of ${groupSize} → ${advancing} advance`;
  if (qualifyPerGroup >= groupSize) message = 'Qualify count must be less than group size';
  else if (leftover !== 0)
    message = `Cannot fill equal groups of ${groupSize} from ${incomingTeams} teams (leftover ${leftover}).`;
  return { groupsNeeded, advancing, leftover, valid, message };
}
