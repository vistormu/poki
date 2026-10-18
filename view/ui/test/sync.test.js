import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { Data } from "../static/js/data/data.js";
import { Syncer, SYNCED, WAITING, OFF, AFTER_CHANGE, EVERY } from "../static/js/data/sync.js";
import { memory } from "./memory.js";

// server is a fake /api/sync: it records each body and answers with what
// answer(body) returns, or throws while down.
function server(answer = (body) => ({ rev: 1, rejected: [], changes: [] })) {
  const s = {
    bodies: [],
    down: false,
    async post(body) {
      s.bodies.push(structuredClone(body));
      if (s.down) throw new Error("offline");
      return answer(body);
    },
  };
  return s;
}

test("a first sync takes everything, then only what's new", async () => {
  const d = await Data.open(memory());
  const s = server((body) => ({ rev: 5, rejected: [], changes: [] }));
  const sy = new Syncer(d, s.post);
  await sy.sync();
  await sy.sync();
  assert.deepEqual(
    s.bodies.map((b) => b.since),
    [0, 5],
  );
});

test("the outbox goes out without its order numbers, and leaves once taken", async () => {
  const d = await Data.open(memory());
  const s = server();
  const sy = new Syncer(d, s.post);
  await d.put("meals", "m", { name: "soup" });
  assert.equal(sy.state.status, WAITING);
  assert.equal(sy.state.pending, 1);
  await sy.sync();
  const [op] = s.bodies[0].ops;
  assert.equal(op.seq, undefined);
  assert.equal(op.type, "put");
  assert.equal(op.id, "m");
  assert.match(op.op, /^[0-9a-f-]{36}$/);
  assert.equal(sy.state.status, SYNCED);
  assert.equal(sy.state.pending, 0);
});

test("a failed sync is a state, and the outbox waits", async () => {
  const d = await Data.open(memory());
  const s = server();
  const sy = new Syncer(d, s.post);
  const seen = [];
  sy.subscribe((st) => seen.push(st.status + (st.syncing ? "…" : "")));
  await d.put("meals", "m", { name: "soup" });
  s.down = true;
  await sy.sync(); // never throws
  assert.equal(sy.state.status, OFF);
  assert.equal(d.outbox.length, 1);
  s.down = false;
  await sy.sync();
  assert.equal(sy.state.status, SYNCED);
  assert.deepEqual(seen, ["waiting…", "off", "off…", "synced"]);
});

test("one sync at a time; a change during it brings another", async () => {
  const d = await Data.open(memory());
  let release;
  const s = server();
  const slow = (body) => new Promise((r) => (release = () => r(s.post(body))));
  const sy = new Syncer(d, slow);
  const first = sy.sync();
  assert.equal(sy.state.syncing, true);
  await d.put("meals", "m", { name: "soup" });
  sy.sync(); // while the first is out
  release();
  await first;
  await new Promise((r) => setImmediate(r));
  release(); // the second
  await sy.running;
  assert.equal(s.bodies.length, 2);
  assert.equal(s.bodies[1].ops.length, 1);
  assert.equal(d.outbox.length, 0);
});

test("a rejected op brings a full sync after", async () => {
  const d = await Data.open(memory());
  await d.put("ingredients", "n", { meal_id: "gone", item_id: "gone" });
  const s = server((body) =>
    body.since === 0 && body.ops.length === 0
      ? { rev: 4, rejected: [], changes: [{ table: "meals", id: "m", rev: 4, deleted: false, fields: { name: "soup" } }] }
      : { rev: 4, rejected: body.ops.map((o) => o.op), changes: [] },
  );
  const sy = new Syncer(d, s.post);
  const refused = [];
  sy.onRejected = (ops) => refused.push(...ops.map((op) => [op.table, op.id, !!d.get(op.table, op.id)]));
  sy.full = false; // as after a first sync
  d.rev = 3;
  await sy.sync();
  await sy.running;
  assert.deepEqual(
    s.bodies.map((b) => [b.since, b.ops.length]),
    [
      [3, 1],
      [0, 0],
    ],
  );
  assert.equal(d.get("ingredients", "n"), undefined); // the server never had it
  assert.deepEqual(refused, [["ingredients", "n", true]]); // told while the row is still here, to name it
  assert.equal(d.get("meals", "m").name, "soup");
});

test("start: on launch, a second after the last change, online, visible, every 30 s", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const d = await Data.open(memory());
  const s = server();
  const sy = new Syncer(d, s.post, globalThis);
  const events = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  };

  await sy.start(events, doc);
  assert.equal(s.bodies.length, 1); // launch

  await d.put("meals", "m", { name: "soup" });
  await d.put("meals", "m", { name: "stew" });
  t.mock.timers.tick(AFTER_CHANGE - 1);
  await settle();
  assert.equal(s.bodies.length, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(s.bodies.length, 2); // one sync for the burst
  assert.equal(s.bodies[1].ops.length, 2);

  events.dispatchEvent(new Event("online"));
  await settle();
  doc.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(s.bodies.length, 4);

  t.mock.timers.tick(EVERY);
  await settle();
  assert.equal(s.bodies.length, 5);
  doc.visibilityState = "hidden";
  t.mock.timers.tick(EVERY);
  await settle();
  assert.equal(s.bodies.length, 5); // not while hidden
});
