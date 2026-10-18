import { test } from "node:test";
import assert from "node:assert/strict";

import { Data, NO_MEAL } from "../static/js/data/data.js";
import * as p from "../static/js/data/plan.js";
import { memory } from "./memory.js";

async function kitchen() {
  const d = await Data.open(memory());
  await d.change([
    { type: "put", table: "meals", id: NO_MEAL, fields: { name: "No meal" } },
    { type: "put", table: "items", id: "moz", fields: { name: "Mozzarella", unit: "g", group_id: null } },
    { type: "put", table: "items", id: "oil", fields: { name: "Olive oil", unit: "none", group_id: null } },
    { type: "put", table: "meals", id: "las", fields: { name: "Lasagna" } },
    { type: "put", table: "meals", id: "sal", fields: { name: "Green salad" } },
    { type: "put", table: "meals", id: "bur", fields: { name: "Burgers" } },
    { type: "put", table: "ingredients", id: "n1", fields: { meal_id: "las", item_id: "moz", amount: 200 } },
    { type: "put", table: "ingredients", id: "n2", fields: { meal_id: "las", item_id: "oil", amount: null } },
  ]);
  return d;
}

const names = (d, date, slot) => p.entries(d, date, slot).map((e) => e.meal.name).join(", ");
const day = "2026-10-17";

test("dates: days, the monday-to-sunday week, labels", () => {
  assert.equal(p.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(p.addDays("2026-10-17", -7), "2026-10-10");
  assert.equal(p.addDays("2026-03-28", 1), "2026-03-29"); // summer time starts
  assert.deepEqual(p.week("2026-10-17"), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.equal(p.week("2026-10-12")[0], "2026-10-12"); // a monday starts its own week
  assert.equal(p.week("2026-10-18")[0], "2026-10-12"); // a sunday ends it
  assert.equal(p.label("2026-10-17"), "SAT 17 OCT");
  assert.equal(p.label("2026-10-17", true), "SAT 17");
  assert.equal(p.iso(new Date(2026, 0, 5)), "2026-01-05");
});

test("place: last in the slot; no meal only in an empty slot", async () => {
  const d = await kitchen();
  await p.place(d, day, "lunch", "las");
  await p.place(d, day, "lunch", "sal");
  assert.equal(names(d, day, "lunch"), "Lasagna, Green salad");
  assert.equal(await p.place(d, day, "lunch", NO_MEAL), null);
  assert.ok(await p.place(d, day, "dinner", NO_MEAL));
  assert.equal(await p.place(d, day, "dinner", "gone"), null);
  assert.equal(names(d, day, "dinner"), "No meal");
});

test("place: a meal replaces a no meal", async () => {
  const d = await kitchen();
  await p.place(d, day, "dinner", NO_MEAL);
  await p.place(d, day, "dinner", "bur");
  assert.equal(names(d, day, "dinner"), "Burgers");
  assert.equal(p.isNoMeal(p.entries(d, day, "dinner")), false);
});

test("move: joins a slot last, replaces a no meal; no meal is not moved", async () => {
  const d = await kitchen();
  const las = await p.place(d, day, "lunch", "las");
  await p.place(d, day, "lunch", "sal");
  await p.move(d, las, day, "lunch"); // its own slot: last
  assert.equal(names(d, day, "lunch"), "Green salad, Lasagna");

  const none = await p.place(d, "2026-10-18", "dinner", NO_MEAL);
  await p.move(d, las, "2026-10-18", "dinner");
  assert.equal(names(d, day, "lunch"), "Green salad");
  assert.equal(names(d, "2026-10-18", "dinner"), "Lasagna");
  assert.equal(d.get("plan_entries", none), undefined);

  const again = await p.place(d, day, "dinner", NO_MEAL);
  assert.equal(await p.move(d, again, day, "lunch"), false);
});

test("swap: two meals trade places, across days", async () => {
  const d = await kitchen();
  const las = await p.place(d, day, "lunch", "las");
  await p.place(d, day, "lunch", "sal");
  const bur = await p.place(d, "2026-10-18", "dinner", "bur");
  await p.swap(d, las, bur);
  assert.equal(names(d, day, "lunch"), "Burgers, Green salad");
  assert.equal(names(d, "2026-10-18", "dinner"), "Lasagna");
  const none = await p.place(d, day, "dinner", NO_MEAL);
  assert.equal(await p.swap(d, las, none), false);
  assert.equal(await p.swap(d, las, las), false);
});

test("marks: unmarked by default; buy, ?, back to none; removing keeps the list", async () => {
  const d = await kitchen();
  const id = await p.place(d, day, "lunch", "las");
  const [moz, oil] = p.planned(d, id);
  assert.deepEqual([moz.mark, oil.mark], ["none", "none"]);

  await p.mark(d, id, moz, "buy");
  await p.mark(d, id, oil, "check");
  let list = d.all("list_entries");
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((l) => [l.item_id, l.amount, l.state, l.plan_entry_id]).sort(),
    [
      ["moz", 200, "buy", id],
      ["oil", null, "check", id],
    ],
  );

  await p.mark(d, id, moz, "check"); // changed, not doubled
  assert.equal(d.all("list_entries").length, 2);
  assert.equal(p.planned(d, id)[0].mark, "check");

  await p.mark(d, id, moz, "none");
  assert.deepEqual(p.planned(d, id).map((n) => n.mark), ["none", "check"]);

  await p.remove(d, id);
  assert.equal(p.entries(d, day, "lunch").length, 0);
  assert.equal(d.all("list_entries").length, 1); // the ? stays on the list
});

test("marks: bought counts as buy, and buy leaves it bought", async () => {
  const d = await kitchen();
  const id = await p.place(d, day, "lunch", "las");
  const [moz] = p.planned(d, id);
  await p.mark(d, id, moz, "buy");
  const [entry] = d.all("list_entries");
  await d.put("list_entries", entry.id, { state: "bought" });
  assert.equal(p.planned(d, id)[0].mark, "buy");
  await p.mark(d, id, p.planned(d, id)[0], "buy");
  assert.equal(d.get("list_entries", entry.id).state, "bought");
});

test("remove: its undo puts the entry back, unless its slot can't take it", async () => {
  const d = await kitchen();
  const las = await p.place(d, day, "lunch", "las");
  await p.place(d, day, "lunch", "sal");
  let undo = await p.remove(d, las);
  assert.equal(names(d, day, "lunch"), "Green salad");
  assert.equal(await undo(), true);
  assert.equal(names(d, day, "lunch"), "Lasagna, Green salad"); // where it was

  const none = await p.place(d, day, "dinner", NO_MEAL);
  undo = await p.remove(d, none);
  await p.place(d, day, "dinner", "bur");
  assert.equal(await undo(), false); // no meal goes only in an empty slot
  assert.equal(names(d, day, "dinner"), "Burgers");

  const bur = p.entries(d, day, "dinner")[0].id;
  undo = await p.remove(d, bur);
  await p.place(d, day, "dinner", NO_MEAL);
  assert.equal(await undo(), false); // its slot is marked no meal now
  assert.equal(await p.remove(d, "gone"), null);
});
