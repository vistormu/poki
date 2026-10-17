// memory is persist for tests: indexeddb's contract, in maps. it copies what
// it keeps, as indexeddb does, and can be told to fail.
import { tables } from "../static/js/data/data.js";

export function memory() {
  const m = {
    rows: Object.fromEntries(tables.map((t) => [t, new Map()])),
    outbox: new Map(),
    rev: 0,
    commits: 0,
    fail: false,
    async load() {
      return {
        rows: Object.fromEntries(tables.map((t) => [t, [...m.rows[t].values()].map((r) => structuredClone(r))])),
        outbox: [...m.outbox.values()].map((op) => structuredClone(op)),
        rev: m.rev,
      };
    },
    async commit({ clear, puts = [], removes = [], outboxAdd = [], outboxRemove = [], rev }) {
      if (m.fail) throw new Error("disk full");
      m.commits++;
      if (clear) for (const t of tables) m.rows[t].clear();
      for (const { table, row } of puts) m.rows[table].set(row.id, structuredClone(row));
      for (const { table, id } of removes) m.rows[table].delete(id);
      for (const op of outboxAdd) m.outbox.set(op.op, structuredClone(op));
      for (const id of outboxRemove) m.outbox.delete(id);
      if (rev !== undefined) m.rev = rev;
    },
  };
  return m;
}
