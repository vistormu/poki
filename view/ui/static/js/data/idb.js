// idb keeps the local store in indexeddb: a store per table, the outbox, and
// the rev. a commit is one indexeddb transaction: rows and outbox together.

import { tables } from "./data.js";

const NAME = "poki";
const VERSION = 1;

export async function idb() {
  const db = await done(
    (() => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        for (const t of tables) req.result.createObjectStore(t, { keyPath: "id" });
        req.result.createObjectStore("outbox", { keyPath: "op" });
        req.result.createObjectStore("meta");
      };
      return req;
    })(),
  );
  const stores = [...tables, "outbox", "meta"];

  return {
    async load() {
      // every read asked at once: a transaction may close between awaits
      const tx = db.transaction(stores, "readonly");
      const [outbox, rev, ...all] = await Promise.all([
        done(tx.objectStore("outbox").getAll()),
        done(tx.objectStore("meta").get("rev")),
        ...tables.map((t) => done(tx.objectStore(t).getAll())),
      ]);
      const rows = Object.fromEntries(tables.map((t, i) => [t, all[i]]));
      return { rows, outbox, rev: rev || 0 };
    },

    commit({ clear, puts = [], removes = [], outboxAdd = [], outboxRemove = [], rev }) {
      const tx = db.transaction(stores, "readwrite");
      if (clear) for (const t of tables) tx.objectStore(t).clear();
      for (const { table, row } of puts) tx.objectStore(table).put(row);
      for (const { table, id } of removes) tx.objectStore(table).delete(id);
      for (const op of outboxAdd) tx.objectStore("outbox").put(op);
      for (const id of outboxRemove) tx.objectStore("outbox").delete(id);
      if (rev !== undefined) tx.objectStore("meta").put(rev, "rev");
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
  };
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
