// the list and the path, as the screens change them: each function writes
// through data.change, with the rules the server keeps (domain/service/list.go,
// groups.go): one list entry per addition; ? entries one by one, to buy and
// bought summed per item (decisions/0009); a group's name is unique, never
// "Other"; deleting a group sends its items to Other (decisions/0012).

import { amountFor, pickOps, tones } from "./meals.js";
import { capital, fold } from "./match.js";

const put = (table, id, fields) => ({ type: "put", table, id, fields });
const del = (table, id) => ({ type: "del", table, id });
const newID = () => crypto.randomUUID();
const byName = (a, b) => fold(a.name).localeCompare(fold(b.name));

// path is the groups in the order we walk the store, each with its place (1…)
// and tone; Other is not one of them.
export function path(data) {
  return data
    .all("groups")
    .sort((a, b) => a.position - b.position)
    .map((g, i) => ({ ...g, place: i + 1, tone: tones[i % tones.length] }));
}

// other is Other's tone: the next after the last group's.
export const otherTone = (groups) => tones[groups.length % tones.length];

// total sums the entries' amounts: null when none has one.
export function total(entries) {
  const with_ = entries.filter((e) => e.amount != null);
  return with_.length ? with_.reduce((n, e) => n + e.amount, 0) : null;
}

// sheet is the list as it reads (spec → list): the ? entries one by one with
// their meals; every group in path order, empty ones too, a row per item to
// buy with its total, then Other when it holds something; the bought ones
// apart, in path order. an empty list has no groups either (the cleared
// list's one muted line).
export function sheet(data) {
  const groups = path(data);
  const items = new Map(data.all("items").map((it) => [it.id, it]));
  const check = [];
  const rows = { buy: new Map(), bought: new Map() };
  for (const e of data.all("list_entries")) {
    const item = items.get(e.item_id);
    if (!item) continue;
    if (e.state === "check") {
      const p = e.plan_entry_id && data.get("plan_entries", e.plan_entry_id);
      check.push({ entry: e, item, meal: p ? data.get("meals", p.meal_id)?.name || "" : "" });
      continue;
    }
    const m = rows[e.state];
    if (!m) continue;
    if (!m.has(item.id)) m.set(item.id, { item, entries: [] });
    m.get(item.id).entries.push(e);
  }
  check.sort((a, b) => byName(a.item, b.item) || a.meal.localeCompare(b.meal));
  const shelves = [...groups.map((g) => ({ group: g, tone: g.tone, rows: [] })), { group: null, tone: otherTone(groups), rows: [] }];
  const shelfOf = (item) => shelves.find((s) => s.group?.id === item.group_id) || shelves[shelves.length - 1];
  const done = (r) => ({ ...r, total: total(r.entries), tone: shelfOf(r.item).tone });
  for (const r of rows.buy.values()) shelfOf(r.item).rows.push(done(r));
  for (const s of shelves) s.rows.sort((a, b) => byName(a.item, b.item));
  const order = (r) => shelves.indexOf(shelfOf(r.item));
  const bought = [...rows.bought.values()].map(done).sort((a, b) => order(a) - order(b) || byName(a.item, b.item));
  const empty = !check.length && !bought.length && shelves.every((s) => !s.rows.length);
  return { check, groups: empty ? [] : shelves.filter((s) => s.group || s.rows.length), bought };
}

// add puts a picked item on the list by hand, to buy, with its amount.
export async function add(data, pick) {
  const [itemID, ops] = pickOps(data, pick);
  const unit = pick.item ? pick.item.unit : pick.unit;
  ops.push(put("list_entries", newID(), { item_id: itemID, amount: amountFor(unit, pick.amount), plan_entry_id: null, state: "buy" }));
  await data.change(ops);
}

// resolve settles a ? entry: buy puts it to buy, have takes it off the list.
export function resolve(data, entryID, to) {
  return to === "buy" ? data.put("list_entries", entryID, { state: "buy" }) : data.del("list_entries", entryID);
}

// tick marks an item bought, all its entries, as its row is one; untick puts
// it back to buy.
export const tick = (data, itemID) => move(data, itemID, "buy", "bought");
export const untick = (data, itemID) => move(data, itemID, "bought", "buy");

function move(data, itemID, from, to) {
  const ops = data
    .all("list_entries")
    .filter((e) => e.item_id === itemID && e.state === from)
    .map((e) => put("list_entries", e.id, { state: to }));
  return ops.length ? data.change(ops) : Promise.resolve();
}

// clear empties the whole list, whatever the state, and returns its undo:
// what puts every entry back, and the items they were the last use of.
export async function clear(data) {
  const entries = data.all("list_entries");
  if (!entries.length) return null;
  const items = [...new Set(entries.map((e) => e.item_id))].map((id) => data.get("items", id)).filter(Boolean);
  await data.change(entries.map((e) => del("list_entries", e.id)));
  const back = [...items.map(({ id, ...f }) => put("items", id, f)), ...entries.map(({ id, ...f }) => put("list_entries", id, f))];
  return () => data.change(back);
}

// a group's name is trimmed, there, at most 24 long, not Other, and no other
// group's (ignoring case)
function groupName(data, id, name) {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n || [...n].length > 24 || fold(n) === "other") return null;
  if (data.all("groups").some((g) => g.id !== id && fold(g.name) === fold(n))) return null;
  return capital(n);
}

// addGroup makes a group last on the path (before Other) and returns its id,
// or null when the name can't be one. item, when given, takes it at once.
export async function addGroup(data, name, itemID = null) {
  const n = groupName(data, null, name);
  if (!n) return null;
  const id = newID();
  const last = data.all("groups").reduce((m, g) => Math.max(m, g.position), 0);
  const ops = [put("groups", id, { name: n, position: last + 1 })];
  if (itemID) ops.push(put("items", itemID, { group_id: id }));
  await data.change(ops);
  return id;
}

// renameGroup renames a group; its items stay. a name that can't be one is
// not saved.
export async function renameGroup(data, id, name) {
  const n = groupName(data, id, name);
  const g = data.get("groups", id);
  if (!n || !g || g.name === n) return false;
  await data.put("groups", id, { name: n });
  return true;
}

// moveGroup puts a group at a place on the path (0 first) and renumbers the
// path 1…n; only the groups whose position changed are written.
export async function moveGroup(data, id, to) {
  const ids = path(data).map((g) => g.id);
  const from = ids.indexOf(id);
  if (from < 0 || from === to) return;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
  const ops = ids.flatMap((gid, i) => (data.get("groups", gid).position === i + 1 ? [] : [put("groups", gid, { position: i + 1 })]));
  if (ops.length) await data.change(ops);
}

// giveGroup gives an item its group, for good.
export function giveGroup(data, itemID, groupID) {
  return data.put("items", itemID, { group_id: groupID });
}

// deleteGroup deletes a group: its items go to Other, and those nothing uses
// go (decisions/0012). it returns its undo: the group and its items back.
export async function deleteGroup(data, id) {
  const g = data.get("groups", id);
  if (!g) return null;
  const items = data.all("items").filter((it) => it.group_id === id);
  await data.del("groups", id);
  const { id: _, ...fields } = g;
  return () => data.change([put("groups", id, fields), ...items.map(({ id, ...f }) => put("items", id, f))]);
}
