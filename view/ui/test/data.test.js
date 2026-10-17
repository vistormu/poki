import { test } from "node:test";
import assert from "node:assert/strict";

import { Data } from "../static/js/data/data.js";
import { memory } from "./memory.js";

const put = (table, id, fields) => ({ type: "put", table, id, fields });
const del = (table, id) => ({ type: "del", table, id });

// ids says a table's live rows: "a b c".
const ids = (d, table) =>
  d
    .all(table)
    .map((r) => r.id)
    .sort()
    .join(" ");

async function fresh() {
  const m = memory();
  return [await Data.open(m), m];
}

// a kitchen: Dairy with milk and mozzarella; lasagna uses mozzarella, planned
// once, its mozzarella marked buy; salt is in no group and no meal.
async function kitchen() {
  const [d, m] = await fresh();
  await d.change([
    put("groups", "g", { name: "Dairy", position: 1 }),
    put("items", "milk", { name: "milk", unit: "count", group_id: "g" }),
    put("items", "moz", { name: "mozzarella", unit: "g", group_id: "g" }),
    put("items", "salt", { name: "salt", unit: "none", group_id: null }),
    put("meals", "m", { name: "lasagna" }),
    put("ingredients", "n", { meal_id: "m", item_id: "moz", amount: 200 }),
    put("ingredients", "ns", { meal_id: "m", item_id: "salt", amount: null }),
    put("plan_entries", "p", { date: "2026-10-17", slot: "dinner", meal_id: "m", position: 1 }),
    put("list_entries", "l", { item_id: "moz", amount: 200, plan_entry_id: "p", state: "buy" }),
  ]);
  return [d, m];
}

test("a change is applied, queued and kept, in one write", async () => {
  const [d, m] = await fresh();
  await d.change([put("meals", "m", { name: "soup" }), put("meals", "m2", { name: "curry" })]);
  assert.equal(d.get("meals", "m").name, "soup");
  assert.deepEqual(
    d.outbox.map((op) => [op.type, op.id, op.seq]),
    [
      ["put", "m", 1],
      ["put", "m2", 2],
    ],
  );
  assert.equal(m.commits, 1);

  const again = await Data.open(m); // the next launch
  assert.equal(ids(again, "meals"), "m m2");
  assert.deepEqual(
    again.outbox.map((op) => op.id),
    ["m", "m2"],
  );
});

test("a put changes the fields it has", async () => {
  const [d] = await kitchen();
  await d.put("items", "moz", { name: "mozzarella di bufala" });
  assert.deepEqual(d.get("items", "moz"), { id: "moz", name: "mozzarella di bufala", unit: "g", group_id: "g" });
});

test("a change that can't be kept changes nothing", async () => {
  const [d, m] = await fresh();
  m.fail = true;
  await assert.rejects(d.put("meals", "m", { name: "soup" }));
  assert.equal(d.outbox.length, 0);
});

test("deleting a group sends its items to Other, and the unused go", async () => {
  const [d] = await kitchen();
  await d.del("groups", "g");
  assert.equal(ids(d, "groups"), "");
  assert.equal(ids(d, "items"), "moz salt");
  assert.equal(d.get("items", "moz").group_id, null);
  assert.equal(d.outbox.at(-1).type, "del"); // one op: the server does the same
});

test("deleting a meal takes its ingredients and plan entries; the list keeps its entries", async () => {
  const [d] = await kitchen();
  await d.del("meals", "m");
  assert.equal(ids(d, "ingredients"), "");
  assert.equal(ids(d, "plan_entries"), "");
  assert.equal(ids(d, "list_entries"), "l");
  assert.equal(ids(d, "items"), "milk moz"); // salt: only lasagna used it
});

test("the last use of an ungrouped item takes it", async () => {
  const [d] = await kitchen();
  await d.put("items", "moz", { group_id: null });
  assert.equal(ids(d, "items"), "milk moz salt"); // still used
  await d.del("ingredients", "n");
  await d.del("list_entries", "l");
  assert.equal(ids(d, "items"), "milk salt");
  await d.put("items", "milk", { group_id: null }); // taken off its group, unused
  assert.equal(ids(d, "items"), "salt");
});

test("repicking an ingredient lets the stray item go", async () => {
  const [d] = await kitchen();
  await d.change([put("items", "typo", { name: "parmesan", unit: "g", group_id: null }), put("ingredients", "n2", { meal_id: "m", item_id: "typo" })]);
  assert.match(ids(d, "items"), /typo/); // made and used in one change: it stays
  await d.change([put("items", "parm", { name: "parmesan", unit: "g", group_id: null }), put("ingredients", "n2", { item_id: "parm" })]);
  assert.doesNotMatch(ids(d, "items"), /typo/);
});

test("a new item with nothing using it yet stays", async () => {
  const [d] = await fresh();
  await d.put("items", "i", { name: "candles", unit: "count", group_id: null });
  assert.equal(ids(d, "items"), "i");
});

test("deleting what is gone is nothing", async () => {
  const [d] = await kitchen();
  await d.del("meals", "nope");
  await d.del("not_a_table", "x");
  assert.equal(ids(d, "meals"), "m");
});

test("the server's answer: sent ops leave, its rows replace ours, the rest is laid over them", async () => {
  const [d, m] = await kitchen();
  const sent = [...d.outbox];
  await d.put("meals", "m", { name: "lasagna verde" }); // made while the sync was out
  await d.took(
    sent,
    {
      rev: 9,
      rejected: [],
      changes: [
        { table: "meals", id: "m", rev: 9, deleted: false, fields: { name: "Lasagna" } },
        { table: "meals", id: "other", rev: 9, deleted: false, fields: { name: "curry" } },
        { table: "items", id: "milk", rev: 9, deleted: true, fields: { name: "milk", unit: "count", group_id: "g" } },
      ],
    },
    false,
  );
  assert.deepEqual(
    d.outbox.map((op) => op.fields?.name),
    ["lasagna verde"],
  );
  assert.equal(d.get("meals", "m").name, "lasagna verde"); // ours, still to send
  assert.equal(d.get("meals", "other").name, "curry");
  assert.equal(d.get("items", "milk"), undefined);
  assert.equal(d.rev, 9);

  const again = await Data.open(m);
  assert.equal(again.rev, 9);
  assert.equal(again.outbox.length, 1);
  assert.equal(ids(again, "meals"), "m other");
  assert.equal(ids(again, "items"), "moz salt");
});

test("a full answer replaces everything", async () => {
  const [d, m] = await kitchen();
  const sent = [...d.outbox];
  const res = {
    rev: 3,
    rejected: [sent[0].op],
    changes: [{ table: "meals", id: "m9", rev: 3, deleted: false, fields: { name: "soup" } }],
  };
  await d.took(sent, res, true);
  assert.equal(ids(d, "meals"), "m9");
  assert.equal(ids(d, "items"), "");
  assert.equal(d.outbox.length, 0);
  const again = await Data.open(m);
  assert.equal(ids(again, "meals"), "m9");
  assert.equal(ids(again, "groups"), "");
});

test("a reset replaces everything but keeps what wasn't sent", async () => {
  const [d] = await kitchen();
  const sent = [...d.outbox];
  await d.put("meals", "late", { name: "stew" });
  await d.took(sent, { rev: 1, reset: true, rejected: [], changes: [] }, false);
  assert.equal(ids(d, "meals"), "late");
  assert.equal(ids(d, "items"), "");
  assert.equal(d.outbox.length, 1);
});

test("subscribers hear whose change it was", async () => {
  const [d] = await fresh();
  const heard = [];
  const stop = d.subscribe((local) => heard.push(local));
  await d.put("meals", "m", { name: "soup" });
  await d.took([...d.outbox], { rev: 1, rejected: [], changes: [] }, false);
  stop();
  await d.put("meals", "m", { name: "stew" });
  assert.deepEqual(heard, [true, false]);
});
