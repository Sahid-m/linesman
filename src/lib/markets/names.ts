const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;
const NON_LETTERS = /[^a-z]/g;

/** Loose match: venues spell team names slightly differently ("USA" vs "United States"). */
export function namesLooselyMatch(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(COMBINING_DIACRITICS, "")
      .replace(NON_LETTERS, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function eventMentionsBothTeams(title: string, home: string, away: string): boolean {
  return namesLooselyMatch(title, home) && namesLooselyMatch(title, away);
}
