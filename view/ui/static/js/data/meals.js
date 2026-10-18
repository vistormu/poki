// meals and their ingredients, as the screens change them: each function
// writes through data.change (one write, one outbox entry per op), with the
// rules the server keeps (domain/service/meals.go): unique names, amounts in
// the item's unit, none for `none` items, one ingredient per item.

import { NO_MEAL } from "./data.js";
import { capital, fold, same } from "./match.js";

const put = (table, id, fields) => ({ type: "put", table, id, fields });
const del = (table, id) => ({ type: "del", table, id });
const newID = () => crypto.randomUUID();

// meals are every meal but no meal, alphabetical.
export function meals(data) {
  return data
    .all("meals")
    .filter((m) => m.id !== NO_MEAL)
    .sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
}

// ingredients are a meal's ingredients with their items, by item name.
export function ingredients(data, mealID) {
  return data
    .all("ingredients")
    .filter((n) => n.meal_id === mealID)
    .map((n) => ({ ...n, item: data.get("items", n.item_id) }))
    .filter((n) => n.item)
    .sort((a, b) => fold(a.item.name).localeCompare(fold(b.item.name)));
}

// the album's tones as groups take them along the path; Other, last, takes
// the next (figma.md → the list)
export const tones = ["sky", "pink", "gold", "periwinkle"];

// toneOf is an item's tone: its group's place on the path.
export function toneOf(data, item) {
  const groups = data.all("groups").sort((a, b) => a.position - b.position);
  const i = item?.group_id ? groups.findIndex((g) => g.id === item.group_id) : -1;
  return tones[(i >= 0 ? i : groups.length) % tones.length];
}

// a name is trimmed, there, and at most 40 long (the server's limit)
function cleanName(name) {
  const n = name.trim().replace(/\s+/g, " ");
  return n && [...n].length <= 40 ? capital(n) : null;
}

// createMeal makes a meal named name; it returns its id, or null when the
// name is empty, too long or taken.
export async function createMeal(data, name) {
  const n = cleanName(name);
  if (!n || meals(data).some((m) => same(m.name, n))) return null;
  const id = newID();
  await data.change([put("meals", id, { name: n })]);
  return id;
}

// renameMeal renames a meal; an empty, long or taken name is not saved.
export async function renameMeal(data, id, name) {
  const n = cleanName(name);
  const m = data.get("meals", id);
  if (!n || !m || m.name === n || meals(data).some((o) => o.id !== id && same(o.name, n))) return false;
  await data.put("meals", id, { name: n });
  return true;
}

// deleteMeal deletes a meal, its ingredients and plan entries (their list
// entries stay), and returns its undo: what puts it all back, the items its
// ingredients were the last use of included.
export async function deleteMeal(data, id) {
  const meal = data.get("meals", id);
  if (!meal || id === NO_MEAL) return null;
  const ins = data.all("ingredients").filter((n) => n.meal_id === id);
  const plans = data.all("plan_entries").filter((p) => p.meal_id === id);
  const items = ins.map((n) => data.get("items", n.item_id)).filter(Boolean);
  await data.del("meals", id);
  const back = [
    ...items.map(({ id, ...f }) => put("items", id, f)),
    put("meals", id, { name: meal.name }),
    ...ins.map(({ id, ...f }) => put("ingredients", id, f)),
    ...plans.map(({ id, ...f }) => put("plan_entries", id, f)),
  ];
  return () => data.change(back);
}

// a pick is what the item picker hands back: an existing item ({item}) or a
// new one ({name, unit}), and the amount typed. pickOps is its item's id and
// the ops that make a new one.
export function pickOps(data, pick) {
  if (pick.item) return [pick.item.id, []];
  const id = newID();
  return [id, [put("items", id, { name: capital(pick.name), unit: pick.unit, group_id: null })]];
}

// amountFor is a typed amount in the item's unit: none for `none` items.
export function amountFor(unit, amount) {
  return unit === "none" || !(amount > 0) ? null : amount;
}

// setIngredient puts a picked item in a meal with its amount. editing is the
// ingredient being changed (repicked or retyped), or null for a new one. an
// item the meal has already is changed, not doubled.
export async function setIngredient(data, mealID, editing, pick) {
  const [itemID, ops] = pickOps(data, pick);
  const unit = pick.item ? pick.item.unit : pick.unit;
  const amount = amountFor(unit, pick.amount);
  const other = data.all("ingredients").find((n) => n.meal_id === mealID && n.item_id === itemID && n.id !== editing);
  if (other) {
    ops.push(put("ingredients", other.id, { amount }));
    if (editing) ops.push(del("ingredients", editing));
  } else if (editing) {
    ops.push(put("ingredients", editing, { item_id: itemID, amount }));
  } else {
    ops.push(put("ingredients", newID(), { meal_id: mealID, item_id: itemID, amount }));
  }
  await data.change(ops);
}

// removeIngredient takes an item off a meal; the item goes if nothing else
// keeps it (decisions/0012).
export function removeIngredient(data, id) {
  return data.del("ingredients", id);
}
