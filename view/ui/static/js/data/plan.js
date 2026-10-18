// the plan, as the screens change it: each function writes through
// data.change, with the rules the server keeps (domain/service/plan.go): a
// slot holds meals in position order, or one no meal, or nothing; no meal
// goes only in an empty slot, and is removed, never moved. dates are the
// phone's local dates, YYYY-MM-DD.

import { NO_MEAL } from "./data.js";
import { ingredients } from "./meals.js";

const put = (table, id, fields) => ({ type: "put", table, id, fields });
const del = (table, id) => ({ type: "del", table, id });
const newID = () => crypto.randomUUID();

export const slots = ["lunch", "dinner"];

// iso is a date as the plan writes it.
export function iso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// local is an iso date as a Date at local midnight.
export function local(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => iso(new Date());

export function addDays(date, n) {
  const d = local(date);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// week is the monday to sunday around a date (decisions/0007: a reference only).
export function week(date) {
  const monday = addDays(date, -((local(date).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// label is how the plan writes a date: "SAT 17 OCT"; short leaves the month out.
export function label(date, short = false) {
  const d = local(date);
  const opts = short ? { weekday: "short", day: "numeric" } : { weekday: "short", day: "numeric", month: "short" };
  return d.toLocaleDateString("en-GB", opts).replace(",", "").toUpperCase();
}

// entries are what a slot holds, in order, with their meals.
export function entries(data, date, slot) {
  return data
    .all("plan_entries")
    .filter((p) => p.date === date && p.slot === slot)
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ ...p, meal: data.get("meals", p.meal_id) }))
    .filter((p) => p.meal);
}

// isNoMeal: does the slot hold no meal?
export const isNoMeal = (inSlot) => inSlot.some((p) => p.meal_id === NO_MEAL);

// join is the ops that put a meal (or entry id, moving) last in a slot. a no
// meal there is replaced (figma: Move here, Place here); no meal itself goes
// only in an empty slot, so it returns null for a slot that holds anything.
function join(data, date, slot, id, mealID) {
  const inSlot = entries(data, date, slot).filter((p) => p.id !== id);
  if (mealID === NO_MEAL && inSlot.length) return null;
  const ops = inSlot.filter((p) => p.meal_id === NO_MEAL).map((p) => del("plan_entries", p.id));
  const last = inSlot.reduce((n, p) => Math.max(n, p.position), 0);
  return [...ops, put("plan_entries", id, { date, slot, meal_id: mealID, position: last + 1 })];
}

// place puts a meal (NO_MEAL too) last in a slot and returns the new entry's
// id, or null when the slot can't take it.
export async function place(data, date, slot, mealID) {
  const id = newID();
  const ops = data.get("meals", mealID) && join(data, date, slot, id, mealID);
  if (!ops) return null;
  await data.change(ops);
  return id;
}

// move puts a planned meal last in a slot, its own too. no meal is not moved.
export async function move(data, id, date, slot) {
  const e = data.get("plan_entries", id);
  if (!e || e.meal_id === NO_MEAL) return false;
  await data.change(join(data, date, slot, id, e.meal_id));
  return true;
}

// swap trades the places of two planned meals.
export async function swap(data, a, b) {
  const x = data.get("plan_entries", a);
  const y = data.get("plan_entries", b);
  if (!x || !y || a === b || x.meal_id === NO_MEAL || y.meal_id === NO_MEAL) return false;
  const at = ({ date, slot, position }) => ({ date, slot, position });
  await data.change([put("plan_entries", a, at(y)), put("plan_entries", b, at(x))]);
  return true;
}

// remove takes an entry off the plan, no meal too; what its marks put on the
// list stays (spec → plan). it returns its undo: the entry back where it was,
// unless its slot can't take it any more (a no meal into a slot that holds
// something, a meal into one marked no meal): then the undo does nothing.
export async function remove(data, id) {
  const e = data.get("plan_entries", id);
  if (!e) return null;
  await data.del("plan_entries", id);
  const { id: _, ...fields } = e;
  return async () => {
    const inSlot = entries(data, e.date, e.slot);
    if (e.meal_id === NO_MEAL ? inSlot.length : isNoMeal(inSlot)) return false;
    if (!data.get("meals", e.meal_id)) return false;
    await data.put("plan_entries", id, fields);
    return true;
  };
}

// planned is a planned meal's ingredients, each with its mark: "buy" (bought
// counts as buy), "check" or "none" (decisions/0009).
export function planned(data, id) {
  const e = data.get("plan_entries", id);
  if (!e) return [];
  const marks = new Map(data.all("list_entries").filter((l) => l.plan_entry_id === id).map((l) => [l.item_id, l]));
  return ingredients(data, e.meal_id).map((n) => {
    const entry = marks.get(n.item_id);
    return { ...n, entry, mark: !entry ? "none" : entry.state === "check" ? "check" : "buy" };
  });
}

// mark marks one of a planned meal's ingredients: buy and check put it on the
// list with the ingredient's amount, none takes it off. buy on a bought entry
// leaves it bought.
export async function mark(data, id, ingredient, value) {
  const entry = data.all("list_entries").find((l) => l.plan_entry_id === id && l.item_id === ingredient.item_id);
  if (value === "none") {
    if (entry) await data.del("list_entries", entry.id);
    return;
  }
  if (entry) {
    if (entry.state === value || (entry.state === "bought" && value === "buy")) return;
    await data.put("list_entries", entry.id, { state: value });
    return;
  }
  await data.put("list_entries", newID(), { item_id: ingredient.item_id, amount: ingredient.amount, plan_entry_id: id, state: value });
}
