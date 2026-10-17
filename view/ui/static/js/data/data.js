// the local store (technical-design.md → offline): every live row the phone
// knows, in memory for the screens, kept in indexeddb. a change is applied here
// and queued in the outbox in one write; sync sends the outbox and brings the
// server's rows back.

export const tables = ["groups", "items", "meals", "ingredients", "plan_entries", "list_entries"];

// the reserved meal of a slot left empty on purpose (decisions/0008)
export const NO_MEAL = "00000000-0000-0000-0000-000000000000";

export class Data {
  // persist is where the rows live between launches: indexeddb (idb.js), or
  // memory in tests. its load() gives {rows: {table: [row]}, outbox, rev};
  // its commit({clear, puts, removes, outboxAdd, outboxRemove, rev}) writes
  // all of it, or none.
  constructor(persist) {
    this.persist = persist;
    this.rows = empty();
    this.outbox = []; // ops not yet taken by the server, in order
    this.rev = 0; // the server's rev this phone has caught up to
    this.listeners = new Set();
  }

  static async open(persist) {
    const d = new Data(persist);
    const saved = await persist.load();
    for (const t of tables) for (const row of saved.rows[t] || []) d.rows[t].set(row.id, row);
    d.outbox = [...saved.outbox].sort((a, b) => a.seq - b.seq);
    d.rev = saved.rev || 0;
    return d;
  }

  get(table, id) {
    return this.rows[table].get(id);
  }

  all(table) {
    return [...this.rows[table].values()];
  }

  // subscribe calls fn after every change, with true when it was this phone's
  // (sync waits a second for more) and false when it came from the server.
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // change applies ops ({type: "put"|"del", table, id, fields}) together and
  // queues them: one write, so the outbox never misses a change made here.
  async change(ops) {
    const seq = this.outbox.length ? this.outbox[this.outbox.length - 1].seq : 0;
    const queued = ops.map((op, i) => ({ ...op, op: crypto.randomUUID(), seq: seq + i + 1 }));
    const w = new Writes(this);
    for (const op of queued) w.apply(op);
    w.sweep();
    await this.persist.commit({ ...w.commit(), outboxAdd: queued });
    this.outbox.push(...queued);
    this.notify(true);
  }

  put(table, id, fields) {
    return this.change([{ type: "put", table, id, fields }]);
  }

  del(table, id) {
    return this.change([{ type: "del", table, id }]);
  }

  // took is the server's answer to sent (the outbox as it was sent). the sent
  // ops leave the outbox, taken or rejected; the server's rows replace ours
  // (all of them when full: a first sync, a reset); the ops made meanwhile are
  // laid over them again, so nothing on screen goes back.
  async took(sent, res, full) {
    const gone = new Set(sent.map((op) => op.op));
    this.outbox = this.outbox.filter((op) => !gone.has(op.op));
    const w = new Writes(this);
    if (full || res.reset) w.clear();
    for (const c of res.changes) {
      if (c.deleted) w.remove(c.table, c.id);
      else w.set(c.table, { ...c.fields, id: c.id });
    }
    for (const op of this.outbox) w.apply(op);
    w.sweep();
    this.rev = res.rev;
    await this.persist.commit({ ...w.commit(), outboxRemove: [...gone], rev: res.rev });
    this.notify(false);
  }

  notify(local) {
    for (const fn of this.listeners) fn(local);
  }
}

function empty() {
  return Object.fromEntries(tables.map((t) => [t, new Map()]));
}

// Writes applies ops to the rows and remembers what it touched, for the
// commit. its rules mirror the server's (domain/service/sync.go): a del takes
// what goes with it, and an item left with no group and no use goes.
class Writes {
  constructor(data) {
    this.data = data;
    this.rows = data.rows;
    this.touched = new Map(); // "table/id" → [table, id]
    this.cleared = false;
    this.mayBeUnused = new Set();
  }

  set(table, row) {
    this.rows[table].set(row.id, row);
    this.touched.set(table + "/" + row.id, [table, row.id]);
  }

  remove(table, id) {
    this.rows[table].delete(id);
    this.touched.set(table + "/" + id, [table, id]);
  }

  clear() {
    for (const t of tables) this.rows[t].clear();
    this.touched.clear();
    this.cleared = true;
  }

  apply(op) {
    const { table, id } = op;
    if (!this.rows[table]) return; // the server rejects it too
    const old = this.rows[table].get(id);
    if (op.type === "put") {
      const row = { ...old, ...op.fields, id };
      if (table === "items" && old?.group_id && row.group_id == null) this.mayBeUnused.add(id);
      if ((table === "ingredients" || table === "list_entries") && old && old.item_id !== row.item_id) {
        this.mayBeUnused.add(old.item_id); // repicked
      }
      this.set(table, row);
      return;
    }
    if (!old) return; // gone already
    if (table === "groups") {
      for (const it of this.rows.items.values()) {
        if (it.group_id === id) {
          this.set("items", { ...it, group_id: null });
          this.mayBeUnused.add(it.id);
        }
      }
    }
    if (table === "meals") {
      for (const with_ of ["ingredients", "plan_entries"]) {
        for (const r of [...this.rows[with_].values()]) {
          if (r.meal_id === id) this.apply({ type: "del", table: with_, id: r.id });
        }
      }
    }
    if (table === "ingredients" || table === "list_entries") this.mayBeUnused.add(old.item_id);
    this.remove(table, id);
  }

  // sweep removes the items this write may have left with no group and no use
  // (decisions/0012); the server does the same, and its changes say so.
  sweep() {
    for (const id of this.mayBeUnused) {
      const it = this.rows.items.get(id);
      if (!it || it.group_id != null) continue;
      const used = (t) => [...this.rows[t].values()].some((r) => r.item_id === id);
      if (!used("ingredients") && !used("list_entries")) this.remove("items", id);
    }
    this.mayBeUnused.clear();
  }

  // commit is what to write to persist: every row touched, as it is now.
  commit() {
    const puts = [];
    const removes = [];
    const each = this.cleared ? tables.flatMap((t) => [...this.rows[t].keys()].map((id) => [t, id])) : this.touched.values();
    for (const [table, id] of each) {
      const row = this.rows[table].get(id);
      if (row) puts.push({ table, row });
      else removes.push({ table, id });
    }
    return { clear: this.cleared, puts, removes };
  }
}
