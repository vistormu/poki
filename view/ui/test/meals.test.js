import { test } from "node:test";
import assert from "node:assert/strict";

import { Data, NO_MEAL } from "../static/js/data/data.js";
import * as m from "../static/js/data/meals.js";
import { memory } from "./memory.js";

async function kitchen() {
  const d = await Data.open(memory());
  await d.change([
    { type: "put", table: "meals", id: NO_MEAL, fields: { name: "No meal" } },
    { type: "put", table: "groups", id: "veg", fields: { name: "Veg", position: 1 } },
    { type: "put", table: "groups", id: "dairy", fields: { name: "Dairy", position: 2 } },
    { type: "put", table: "items", id: "moz", fields: { name: "Mozzarella", unit: "g", group_id: "dairy" } },
    { type: "put", table: "items", id: "tom", fields: { name: "Tomatoes", unit: "count", group_id: "veg" } },
    { type: "put", table: "items", id: "oil", fields: { name: "Olive oil", unit: "none", group_id: null } },
    { type: "put", table: "meals", id: "las", fields: { name: "Lasagna" } },
    { type: "put", table: "ingredients", id: "n1", fields: { meal_id: "las", item_id: "moz", amount: 200 } },
    { type: "put", table: "ingredients", id: "n2", fields: { meal_id: "las", item_id: "oil", amount: null } },
    { type: "put", table: "plan_entries", id: "p1", fields: { date: "2026-10-17", slot: "dinner", meal_id: "las", position: 1 } },
  ]);
  return d;
}

const names = (rows) => rows.map((r) => r.name ?? r.item.name).join(", ");

test("meals: alphabetical, no meal hidden", async () => {
  const d = await kitchen();
  await m.createMeal(d, "curry");
  assert.equal(names(m.meals(d)), "Curry, Lasagna");
});

test("createMeal: capitalised, unique, not empty, not long", async () => {
  const d = await kitchen();
  const id = await m.createMeal(d, "  shakshuka  ");
  assert.equal(d.get("meals", id).name, "Shakshuka");
  assert.equal(await m.createMeal(d, "lasagna"), null);
  assert.equal(await m.createMeal(d, "   "), null);
  assert.equal(await m.createMeal(d, "a".repeat(41)), null);
});

test("renameMeal", async () => {
  const d = await kitchen();
  await m.createMeal(d, "curry");
  assert.equal(await m.renameMeal(d, "las", "lasagna verde"), true);
  assert.equal(d.get("meals", "las").name, "Lasagna verde");
  assert.equal(await m.renameMeal(d, "las", "Curry"), false);
  assert.equal(await m.renameMeal(d, "las", ""), false);
  assert.equal(d.get("meals", "las").name, "Lasagna verde");
});

test("ingredients: by name, with tones along the path, Other next", async () => {
  const d = await kitchen();
  const ins = m.ingredients(d, "las");
  assert.equal(names(ins), "Mozzarella, Olive oil");
  assert.deepEqual(
    ins.map((n) => m.toneOf(d, n.item)),
    ["pink", "gold"], // dairy is second; Other follows the two groups
  );
  assert.equal(m.toneOf(d, d.get("items", "tom")), "sky");
});

test("setIngredient: an item, a new item, a repick, an item already there", async () => {
  const d = await kitchen();
  await m.setIngredient(d, "las", null, { item: d.get("items", "tom"), amount: 6 });
  await m.setIngredient(d, "las", null, { name: "basil", unit: "g", amount: 10 });
  await m.setIngredient(d, "las", null, { item: d.get("items", "oil"), amount: 3 }); // already there; none: no amount
  let ins = m.ingredients(d, "las");
  assert.equal(names(ins), "Basil, Mozzarella, Olive oil, Tomatoes");
  assert.deepEqual(
    ins.map((n) => n.amount),
    [10, 200, null, 6],
  );
  assert.equal(ins.length, 4);

  // repick mozzarella as a new, typo-free item; the old one stays (grouped)
  await m.setIngredient(d, "las", "n1", { name: "buffalo mozzarella", unit: "g", amount: 250 });
  ins = m.ingredients(d, "las");
  assert.equal(names(ins), "Basil, Buffalo mozzarella, Olive oil, Tomatoes");
  assert.ok(d.get("items", "moz"));

  // repick basil (ungrouped) as tomatoes, which the meal has: one tomatoes row, basil goes
  const basil = ins.find((n) => n.item.name === "Basil");
  await m.setIngredient(d, "las", basil.id, { item: d.get("items", "tom"), amount: 8 });
  ins = m.ingredients(d, "las");
  assert.equal(names(ins), "Buffalo mozzarella, Olive oil, Tomatoes");
  assert.equal(ins.find((n) => n.item.name === "Tomatoes").amount, 8);
  assert.ok(!d.all("items").some((i) => i.name === "Basil"));
});

test("removeIngredient: the item goes when nothing keeps it", async () => {
  const d = await kitchen();
  await m.removeIngredient(d, "n2");
  assert.equal(d.get("items", "oil"), undefined);
  await m.removeIngredient(d, "n1");
  assert.ok(d.get("items", "moz")); // grouped: stays
});

test("deleteMeal and its undo", async () => {
  const d = await kitchen();
  const undo = await m.deleteMeal(d, "las");
  assert.equal(m.meals(d).length, 0);
  assert.equal(d.all("ingredients").length, 0);
  assert.equal(d.all("plan_entries").length, 0);
  assert.equal(d.get("items", "oil"), undefined); // its last use

  await undo();
  assert.equal(names(m.meals(d)), "Lasagna");
  assert.equal(names(m.ingredients(d, "las")), "Mozzarella, Olive oil");
  assert.equal(d.all("plan_entries").length, 1);
  assert.equal(await m.deleteMeal(d, NO_MEAL), null);
});
