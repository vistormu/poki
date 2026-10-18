// matching for the pickers (spec → the item picker): the names close to what
// is typed come first. case, accents (platano / plátano), a plural ending
// (tomate / tomates, limón / limones) and a typo or two (mozarella) don't
// matter.

// fold lowercases, strips accents and squeezes spaces.
export function fold(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

// forms are a folded name and its singulars: the last word without its s or
// es. two names match when their forms meet.
function forms(folded) {
  const out = new Set([folded]);
  for (const end of ["es", "s"]) if (folded.endsWith(end) && folded.length > end.length + 1) out.add(folded.slice(0, -end.length));
  return out;
}

// same: the two names are the same item or meal, as far as anyone typing
// could tell (an exact match offers no new one).
export function same(a, b) {
  const fa = forms(fold(a));
  for (const f of forms(fold(b))) if (fa.has(f)) return true;
  return false;
}

// distance is the edit distance between two strings (levenshtein).
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// score is how close a name is to the query, lower is closer, or -1 for not
// at all: the same, then a prefix, then inside it (a word's start first), then
// a typo or two (one for short queries, none under four letters).
function score(query, name) {
  const q = fold(query);
  const n = fold(name);
  if (same(q, n)) return 0;
  for (const f of forms(q)) {
    if (n.startsWith(f)) return 1;
  }
  for (const f of forms(q)) {
    if (n.includes(" " + f)) return 2;
    if (n.includes(f)) return 3;
  }
  const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  if (max === 0) return -1;
  // a typo in the whole name, or in its start as long as the query
  const d = Math.min(...[...forms(q)].flatMap((f) => [distance(f, n), distance(f, n.slice(0, f.length))]));
  return d <= max ? 4 + d : -1;
}

// rank orders the rows whose name (nameOf) is close to the query, closest
// first, then alphabetically. an empty query matches nothing.
export function rank(query, rows, nameOf = (r) => r.name) {
  if (!fold(query)) return [];
  return rows
    .map((r) => ({ r, s: score(query, nameOf(r)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || fold(nameOf(a.r)).localeCompare(fold(nameOf(b.r))))
    .map((x) => x.r);
}

// capital is a new name as it is kept: its first letter up ("mozz" → "Mozz").
export function capital(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
