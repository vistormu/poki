// amounts as typed and shown (decisions/0005, 0012): an amount and its unit at
// the end of a name — "mozzarella 500g", "eggs 6", "onion 0,5", "onion 1/2" —
// and back to text: "500 g", "6", "0.5".

const trailing = /^(.*?)\s*(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(g)?$/i;

// parse splits what was typed into a name and, if it ends with one, an amount
// and the unit it implies: g with a g, count without, none with no amount.
export function parse(text) {
  const t = text.trim().replace(/\s+/g, " ");
  const m = t.match(trailing);
  if (!m || !m[1]) return { name: t, amount: null, unit: "none" };
  const amount = number(m[2]);
  if (!(amount > 0)) return { name: t, amount: null, unit: "none" };
  return { name: m[1], amount, unit: m[3] ? "g" : "count" };
}

function number(s) {
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    return d ? n / d : NaN;
  }
  return Number(s.replace(",", "."));
}

// format says an amount in a unit: "200 g", "6", "0.5"; "" for none. rounded
// to two decimals, so sums of fractions read clean (as model.FormatAmount).
export function format(amount, unit) {
  if (amount == null || unit === "none") return "";
  const s = String(Math.round(amount * 100) / 100);
  return unit === "g" ? s + " g" : s;
}

// typed is an amount as one types it back into a field: "250g", "6".
export function typed(amount, unit) {
  if (amount == null || unit === "none") return "";
  return format(amount, unit).replace(" ", "");
}
