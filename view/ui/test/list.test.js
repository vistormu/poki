import { test } from "node:test";
import assert from "node:assert/strict";

import { Data, NO_MEAL } from "../static/js/data/data.js";
import * as l from "../static/js/data/list.js";
import { memory } from "./memory.js";

async function kitchen() {
  const d = await Data.open(memory());
  await d.change([
    { type: "put", table: "meals", id: NO_MEAL, fields: { name: "No meal" } },
    { type: "put", table: "groups", id: "veg", fields: { name: "Fruit & veg", position: 1 } },
    { type: "put", table: "groups", id: "dairy", fields: { name: "Dairy", position: 2 } },
    { type: "put", table: "items", id: "moz", fields: { name: "Mozzarella", unit: "g", group_id: "dairy" } },
    { type: "put", table: "items", id: "tom", fields: { name: "Tomatoes", unit: "count", group_id: "veg" } },
    { type: "put", table: "items", id: "yog", fields: { name: "Greek yogurt", unit: "g", group_id: "dairy" } },
    { type: "put", table: "items", id: "soap", fields: { name: "Dish soap", unit: "none", group_id: null } },
    { type: "put", table: "meals", id: "las", fields: { name: "Lasagna" } },
    { type: "put", table: "meals", id: "piz", fields: { name: "Pizza" } },
    { type: "put", table: "plan_entries", id: "p1", fields: { date: "2026-10-17", slot: "lunch", meal_id: "las", position: 1 } },
    { type: "put", table: "plan_entries", id: "p2", fields: { date: "2026-10-18", slot: "dinner", meal_id: "piz", position: 1 } },
    { type: "put", table: "list_entries", id: "c1", fields: { item_id: "moz", amount: 200, plan_entry_id: "p1", state: "check" } },
    { type: "put", table: "list_entries", id: "c2", fields: { item_id: "moz", amount: 125, plan_entry_id: "p2", state: "check" } },
    { type: "put", table: "list_entries", id: "b1", fields: { item_id: "tom", amount: 4, plan_entry_id: "p1", state: "buy" } },
    { type: "put", table: "list_entries", id: "b2", fields: { item_id: "tom", amount: 2, plan_entry_id: null, state: "buy" } },
    { type: "put", table: "list_entries", id: "b3", fields: { item_id: "yog", amount: 500, plan_entry_id: null, state: "buy" } },
    { type: "put", table: "list_entries", id: "b4", fields: { item_id: "soap", amount: null, plan_entry_id: null, state: "buy" } },
  ]);
  return d;
}

const shelves = (s) => s.groups.map((g) => `${g.group?.name ?? "Other"}: ${g.rows.map((r) => `${r.item.name} ${r.total ?? ""}`.trim()).join(", ")}`);

test("sheet: ? one by one with its meal; to buy by group, summed, Other last; tones along the path", async () => {
  const d = await kitchen();
  const s = l.sheet(d);
  assert.deepEqual(
    s.check.map((c) => `${c.item.name} ${c.entry.amount} ${c.meal}`),
    ["Mozzarella 200 Lasagna", "Mozzarella 125 Pizza"],
  );
  assert.deepEqual(shelves(s), ["Fruit & veg: Tomatoes 6", "Dairy: Greek yogurt 500", "Other: Dish soap"]);
  assert.deepEqual(
    s.groups.map((g) => g.tone),
    ["sky", "pink", "gold"],
  );
  assert.deepEqual(s.bought, []);
});

test("resolve: buy joins the item's row; have takes it off", async () => {
  const d = await kitchen();
  await l.resolve(d, "c1", "buy");
  await l.resolve(d, "c2", "have");
  const s = l.sheet(d);
  assert.equal(s.check.length, 0);
  assert.deepEqual(shelves(s)[1], "Dairy: Greek yogurt 500, Mozzarella 200");
});

test("tick and untick: the whole row, apart in path order", async () => {
  const d = await kitchen();
  await l.tick(d, "soap");
  await l.tick(d, "tom");
  let s = l.sheet(d);
  assert.deepEqual(
    s.bought.map((r) => `${r.item.name} ${r.total ?? ""}`.trim()),
    ["Tomatoes 6", "Dish soap"],
  );
  assert.deepEqual(shelves(s), ["Dairy: Greek yogurt 500"]);
  await l.untick(d, "tom");
  s = l.sheet(d);
  assert.deepEqual(shelves(s)[0], "Fruit & veg: Tomatoes 6");
  assert.equal(s.bought.length, 1);
});

test("add: an item by hand, a new one into Other, the amount in its unit", async () => {
  const d = await kitchen();
  await l.add(d, { item: d.get("items", "yog"), amount: 250 });
  await l.add(d, { name: "toilet paper", unit: "none", amount: null });
  await l.add(d, { item: d.get("items", "soap"), amount: 3 }); // none: no amount
  const s = l.sheet(d);
  assert.deepEqual(shelves(s), ["Fruit & veg: Tomatoes 6", "Dairy: Greek yogurt 750", "Other: Dish soap, Toilet paper"]);
});

test("clear: everything goes, unused ungrouped items too; undo puts it all back", async () => {
  const d = await kitchen();
  await l.add(d, { name: "toilet paper", unit: "none", amount: null });
  const undo = await l.clear(d);
  assert.equal(d.all("list_entries").length, 0);
  assert.equal(d.get("items", "soap"), undefined); // ungrouped, nothing uses it
  assert.ok(d.get("items", "moz")); // grouped: stays known
  await undo();
  const s = l.sheet(d);
  assert.equal(s.check.length, 2);
  assert.deepEqual(shelves(s), ["Fruit & veg: Tomatoes 6", "Dairy: Greek yogurt 500", "Other: Dish soap, Toilet paper"]);
  assert.equal(await l.clear(await Data.open(memory())), null);
});

test("groups: add last, unique, not Other; rename; give an item one", async () => {
  const d = await kitchen();
  const id = await l.addGroup(d, "household", "soap");
  assert.deepEqual(
    l.path(d).map((g) => `${g.place} ${g.name}`),
    ["1 Fruit & veg", "2 Dairy", "3 Household"],
  );
  assert.equal(d.get("items", "soap").group_id, id);
  assert.equal(await l.addGroup(d, "DAIRY"), null);
  assert.equal(await l.addGroup(d, "other"), null);
  assert.equal(await l.addGroup(d, "x".repeat(25)), null);
  assert.equal(await l.renameGroup(d, "dairy", "Fruit & VEG"), false);
  assert.equal(await l.renameGroup(d, "dairy", "Cheese & milk"), true);
  assert.equal(d.get("groups", "dairy").name, "Cheese & milk");

  await l.add(d, { name: "batteries", unit: "count", amount: 4 });
  const batteries = d.all("items").find((it) => it.name === "Batteries");
  await l.giveGroup(d, batteries.id, id);
  assert.deepEqual(shelves(l.sheet(d)).at(-1), "Household: Batteries 4, Dish soap");
});

test("deleteGroup: its items to Other, the unused go; undo puts the group and items back", async () => {
  const d = await kitchen();
  await d.put("items", "milk", { name: "Milk", unit: "count", group_id: "dairy" }); // nothing uses it
  const undo = await l.deleteGroup(d, "dairy");
  assert.equal(d.get("groups", "dairy"), undefined);
  assert.equal(d.get("items", "milk"), undefined);
  assert.equal(d.get("items", "yog").group_id, null);
  assert.deepEqual(shelves(l.sheet(d)), ["Fruit & veg: Tomatoes 6", "Other: Dish soap, Greek yogurt 500"]);
  await undo();
  assert.equal(d.get("items", "milk").group_id, "dairy");
  assert.deepEqual(shelves(l.sheet(d)), ["Fruit & veg: Tomatoes 6", "Dairy: Greek yogurt 500", "Other: Dish soap"]);
});
